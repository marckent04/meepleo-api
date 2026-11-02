// Command migrate applies the database migrations of every module. It runs
// before a deployment (Kubernetes job, release step), never from the API
// process, so several API replicas never race on migrations.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/stdlib"

	"github.com/meepleo/meepleo-api/internal/platform/logging"
	"github.com/meepleo/meepleo-api/internal/platform/postgres"
	"github.com/meepleo/meepleo-api/migrations"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return fmt.Errorf("invalid configuration: DATABASE_URL is required")
	}
	log := logging.New(os.Stdout, slog.LevelInfo).With(slog.String("service", "meepleo-migrate"))

	pool, err := postgres.NewPool(ctx, url, 2)
	if err != nil {
		return err
	}
	defer pool.Close()

	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	if err := migrations.Up(ctx, db, log); err != nil {
		return err
	}
	log.InfoContext(ctx, "migrations up to date")
	return nil
}
