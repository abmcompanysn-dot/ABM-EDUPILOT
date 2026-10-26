// Package devpg démarre un PostgreSQL embarqué pour le développement et les tests.
// Il n'est jamais utilisé en production.
package devpg

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
)

type Instance struct {
	pg  *embeddedpostgres.EmbeddedPostgres
	URL string
}

// Start lance PostgreSQL 16 avec ses données dans dir (créé si besoin).
func Start(dir string) (*Instance, error) {
	port, err := freePort()
	if err != nil {
		return nil, err
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, err
	}
	cfg := embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V16).
		Port(uint32(port)).
		Database("edupilot").
		RuntimePath(filepath.Join(abs, "runtime")).
		DataPath(filepath.Join(abs, "data")).
		BinariesPath(filepath.Join(abs, "bin")).
		StartTimeout(3 * time.Minute).
		Logger(nil)
	pg := embeddedpostgres.NewDatabase(cfg)
	if err := pg.Start(); err != nil {
		return nil, err
	}
	return &Instance{pg: pg, URL: fmt.Sprintf("postgres://postgres:postgres@localhost:%d/edupilot?sslmode=disable", port)}, nil
}

func (i *Instance) Stop() error { return i.pg.Stop() }

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}
