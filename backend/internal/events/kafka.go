package events

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
)

type KafkaBus struct {
	brokers  []string
	producer *kgo.Client
}

// NewKafka crée les topics manquants puis ouvre le producteur (idempotent, acks=all).
func NewKafka(ctx context.Context, brokers []string, partitions int) (*KafkaBus, error) {
	producer, err := kgo.NewClient(kgo.SeedBrokers(brokers...), kgo.ProducerLinger(0))
	if err != nil {
		return nil, err
	}
	adm := kadm.NewClient(producer)
	resp, err := adm.CreateTopics(ctx, int32(partitions), 1, nil, AllTopics...)
	if err != nil {
		producer.Close()
		return nil, err
	}
	for _, r := range resp {
		if r.Err != nil && !errors.Is(r.Err, kerr.TopicAlreadyExists) {
			producer.Close()
			return nil, r.Err
		}
	}
	return &KafkaBus{brokers: brokers, producer: producer}, nil
}

func (k *KafkaBus) Publish(ctx context.Context, evs ...Event) error {
	recs := make([]*kgo.Record, 0, len(evs))
	for _, e := range evs {
		v, err := json.Marshal(e)
		if err != nil {
			return err
		}
		recs = append(recs, &kgo.Record{Topic: TopicFor(e.Type), Key: []byte(e.Key), Value: v})
	}
	return k.producer.ProduceSync(ctx, recs...).FirstErr()
}

func (k *KafkaBus) Subscribe(ctx context.Context, o SubOpts, h Handler) error {
	opts := []kgo.Opt{
		kgo.SeedBrokers(k.brokers...),
		kgo.ConsumerGroup(o.Group),
		kgo.ConsumeTopics(o.Topics...),
		kgo.DisableAutoCommit(),
		kgo.FetchMaxWait(o.Linger + 50e6),
	}
	if o.FromLatest {
		opts = append(opts, kgo.ConsumeResetOffset(kgo.NewOffset().AtEnd()))
	}
	cl, err := kgo.NewClient(opts...)
	if err != nil {
		return err
	}
	maxBatch, _ := normalize(o)
	go func() {
		defer cl.Close()
		for {
			fetches := cl.PollRecords(ctx, maxBatch)
			if ctx.Err() != nil {
				return
			}
			fetches.EachError(func(t string, p int32, err error) {
				slog.Error("kafka : erreur de lecture", "topic", t, "partition", p, "err", err)
			})
			var batch []Event
			fetches.EachRecord(func(r *kgo.Record) {
				var e Event
				if err := json.Unmarshal(r.Value, &e); err != nil {
					slog.Error("kafka : événement illisible ignoré", "topic", r.Topic, "offset", r.Offset, "err", err)
					return
				}
				e.Key = string(r.Key)
				batch = append(batch, e)
			})
			if len(batch) > 0 {
				deliver(ctx, o.Group, h, batch)
			}
			if err := cl.CommitUncommittedOffsets(ctx); err != nil && ctx.Err() == nil {
				slog.Error("kafka : échec du commit des offsets", "groupe", o.Group, "err", err)
			}
		}
	}()
	return nil
}

func (k *KafkaBus) Close() error {
	k.producer.Close()
	return nil
}
