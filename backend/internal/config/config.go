// Package config lit la configuration du serveur depuis l'environnement.
package config

import (
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr        string
	DatabaseURL string
	// DevPGDir active une base PostgreSQL embarquée (développement uniquement).
	DevPGDir string
	Roles    map[string]bool

	RedisURL        string
	KafkaBrokers    []string
	KafkaPartitions int

	PublicURL    string
	StaticDir    string
	CookieSecure bool
	Location     *time.Location

	SecretKey     []byte // 32 octets : scellement des secrets et jetons de preuve
	CardMasterKey []byte // 16 octets : dérivation des clés NTAG 424 DNA

	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	DBMaxConns             int32
}

func Load() (*Config, error) {
	c := &Config{
		Addr:                   env("EDUPILOT_ADDR", ":8080"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		DevPGDir:               os.Getenv("EDUPILOT_DEV_PG"),
		PublicURL:              strings.TrimRight(env("EDUPILOT_PUBLIC_URL", "http://localhost:5173"), "/"),
		StaticDir:              os.Getenv("EDUPILOT_STATIC_DIR"),
		RedisURL:               os.Getenv("REDIS_URL"),
		CookieSecure:           env("EDUPILOT_COOKIE_SECURE", "true") == "true",
		BootstrapAdminEmail:    os.Getenv("EDUPILOT_BOOTSTRAP_ADMIN_EMAIL"),
		BootstrapAdminPassword: os.Getenv("EDUPILOT_BOOTSTRAP_ADMIN_PASSWORD"),
		Roles:                  map[string]bool{},
	}
	for _, r := range strings.Split(env("EDUPILOT_ROLES", "api,worker"), ",") {
		if r = strings.TrimSpace(r); r != "" {
			c.Roles[r] = true
		}
	}
	if b := strings.TrimSpace(os.Getenv("KAFKA_BROKERS")); b != "" {
		c.KafkaBrokers = strings.Split(b, ",")
	}
	var err error
	if c.KafkaPartitions, err = strconv.Atoi(env("KAFKA_TOPIC_PARTITIONS", "12")); err != nil {
		return nil, fmt.Errorf("KAFKA_TOPIC_PARTITIONS: %w", err)
	}
	maxConns, err := strconv.Atoi(env("EDUPILOT_DB_MAX_CONNS", "20"))
	if err != nil {
		return nil, fmt.Errorf("EDUPILOT_DB_MAX_CONNS: %w", err)
	}
	c.DBMaxConns = int32(maxConns)
	if c.Location, err = time.LoadLocation(env("EDUPILOT_TZ", "Africa/Dakar")); err != nil {
		return nil, fmt.Errorf("EDUPILOT_TZ: %w", err)
	}
	if c.DatabaseURL == "" && c.DevPGDir == "" {
		return nil, fmt.Errorf("DATABASE_URL est requis (ou EDUPILOT_DEV_PG en développement)")
	}
	if c.SecretKey, err = hexKey("EDUPILOT_SECRET_KEY", 32, c.DevPGDir != ""); err != nil {
		return nil, err
	}
	if c.CardMasterKey, err = hexKey("EDUPILOT_CARD_MASTER_KEY", 16, c.DevPGDir != ""); err != nil {
		return nil, err
	}
	if len(c.KafkaBrokers) == 0 && !(c.Roles["api"] && c.Roles["worker"]) {
		return nil, fmt.Errorf("sans Kafka, les rôles api et worker doivent tourner dans le même processus")
	}
	return c, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// hexKey lit une clé hexadécimale. En développement, une clé absente est
// remplacée par une clé fixe documentée, jamais utilisable en production.
func hexKey(name string, size int, dev bool) ([]byte, error) {
	v := os.Getenv(name)
	if v == "" {
		if dev {
			return make([]byte, size), nil
		}
		return nil, fmt.Errorf("%s est requis (%d octets en hexadécimal)", name, size)
	}
	k, err := hex.DecodeString(v)
	if err != nil || len(k) != size {
		return nil, fmt.Errorf("%s doit faire %d octets en hexadécimal", name, size)
	}
	return k, nil
}
