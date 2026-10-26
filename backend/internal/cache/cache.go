// Package cache fournit un stockage clé/valeur partagé entre les instances de
// l'API (Redis) avec une implémentation en mémoire pour une instance unique.
package cache

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Store interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, val []byte, ttl time.Duration) error
	Del(ctx context.Context, keys ...string) error
	// SetNX écrit la clé seulement si elle n'existe pas ; vrai si elle a été écrite.
	SetNX(ctx context.Context, key string, val []byte, ttl time.Duration) (bool, error)
	// Incr incrémente un compteur ; la durée de vie démarre au premier incrément.
	Incr(ctx context.Context, key string, ttl time.Duration) (int64, error)
	// Raise remplace la valeur si v est strictement supérieur ; vrai si remplacée.
	Raise(ctx context.Context, key string, v int64, ttl time.Duration) (bool, error)
	Close() error
}

// ---------------------------------------------------------------- Redis

type Redis struct{ c *redis.Client }

func NewRedis(ctx context.Context, url string) (*Redis, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	c := redis.NewClient(opt)
	if err := c.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return &Redis{c: c}, nil
}

func (r *Redis) Get(ctx context.Context, key string) ([]byte, bool, error) {
	b, err := r.c.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	return b, err == nil, err
}

func (r *Redis) Set(ctx context.Context, key string, val []byte, ttl time.Duration) error {
	return r.c.Set(ctx, key, val, ttl).Err()
}

func (r *Redis) Del(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	return r.c.Del(ctx, keys...).Err()
}

func (r *Redis) SetNX(ctx context.Context, key string, val []byte, ttl time.Duration) (bool, error) {
	return r.c.SetNX(ctx, key, val, ttl).Result()
}

var incrScript = redis.NewScript(`
local v = redis.call('INCR', KEYS[1])
if v == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return v`)

func (r *Redis) Incr(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	return incrScript.Run(ctx, r.c, []string{key}, ttl.Milliseconds()).Int64()
}

var raiseScript = redis.NewScript(`
local c = redis.call('GET', KEYS[1])
if c and tonumber(c) >= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1`)

func (r *Redis) Raise(ctx context.Context, key string, v int64, ttl time.Duration) (bool, error) {
	n, err := raiseScript.Run(ctx, r.c, []string{key}, v, ttl.Milliseconds()).Int64()
	return n == 1, err
}

func (r *Redis) Close() error { return r.c.Close() }

// ---------------------------------------------------------------- Mémoire

type entry struct {
	val []byte
	exp time.Time
}

type Memory struct {
	mu sync.Mutex
	m  map[string]entry
}

func NewMemory() *Memory {
	m := &Memory{m: map[string]entry{}}
	go m.janitor()
	return m
}

func (m *Memory) janitor() {
	for range time.Tick(time.Minute) {
		now := time.Now()
		m.mu.Lock()
		for k, e := range m.m {
			if !e.exp.IsZero() && now.After(e.exp) {
				delete(m.m, k)
			}
		}
		m.mu.Unlock()
	}
}

func (m *Memory) get(key string) (entry, bool) {
	e, ok := m.m[key]
	if ok && !e.exp.IsZero() && time.Now().After(e.exp) {
		delete(m.m, key)
		return entry{}, false
	}
	return e, ok
}

func expiry(ttl time.Duration) time.Time {
	if ttl <= 0 {
		return time.Time{}
	}
	return time.Now().Add(ttl)
}

func (m *Memory) Get(_ context.Context, key string) ([]byte, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.get(key)
	return e.val, ok, nil
}

func (m *Memory) Set(_ context.Context, key string, val []byte, ttl time.Duration) error {
	m.mu.Lock()
	m.m[key] = entry{val: val, exp: expiry(ttl)}
	m.mu.Unlock()
	return nil
}

func (m *Memory) Del(_ context.Context, keys ...string) error {
	m.mu.Lock()
	for _, k := range keys {
		delete(m.m, k)
	}
	m.mu.Unlock()
	return nil
}

func (m *Memory) SetNX(_ context.Context, key string, val []byte, ttl time.Duration) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.get(key); ok {
		return false, nil
	}
	m.m[key] = entry{val: val, exp: expiry(ttl)}
	return true, nil
}

func (m *Memory) Incr(_ context.Context, key string, ttl time.Duration) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.get(key)
	n := int64(0)
	if ok {
		n, _ = strconv.ParseInt(string(e.val), 10, 64)
	} else {
		e.exp = expiry(ttl)
	}
	n++
	e.val = []byte(strconv.FormatInt(n, 10))
	m.m[key] = e
	return n, nil
}

func (m *Memory) Raise(_ context.Context, key string, v int64, ttl time.Duration) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e, ok := m.get(key); ok {
		if cur, _ := strconv.ParseInt(string(e.val), 10, 64); cur >= v {
			return false, nil
		}
	}
	m.m[key] = entry{val: []byte(strconv.FormatInt(v, 10)), exp: expiry(ttl)}
	return true, nil
}

func (m *Memory) Close() error { return nil }
