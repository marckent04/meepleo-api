// Command api serves the Meepleo REST API.
//
// This is the composition root: the only place that knows every concrete
// implementation and wires the modules together.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/meepleo/meepleo-api/api"
	"github.com/meepleo/meepleo-api/internal/catalog"
	"github.com/meepleo/meepleo-api/internal/identity"
	"github.com/meepleo/meepleo-api/internal/platform/config"
	"github.com/meepleo/meepleo-api/internal/platform/httpserver"
	"github.com/meepleo/meepleo-api/internal/platform/logging"
	"github.com/meepleo/meepleo-api/internal/platform/observability"
	"github.com/meepleo/meepleo-api/internal/platform/postgres"
	"github.com/meepleo/meepleo-api/internal/platform/redis"
)

// version is set at build time (-ldflags "-X main.version=...").
var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "api:", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	log := logging.New(os.Stdout, cfg.LogLevel).With(slog.String("service", "meepleo-api"), slog.String("version", version))

	shutdownOtel, err := observability.Setup(ctx, "meepleo-api", version, os.Getenv)
	if err != nil {
		return err
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := shutdownOtel(ctx); err != nil {
			log.WarnContext(ctx, "otel shutdown", slog.String("error", err.Error()))
		}
	}()

	pool, err := postgres.NewPool(ctx, cfg.Postgres.URL, cfg.Postgres.MaxConns)
	if err != nil {
		return err
	}
	defer pool.Close()

	rdb, err := redis.NewClient(cfg.Redis.URL)
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	handler, health, err := newHandler(ctx, cfg, pool, rdb, log)
	if err != nil {
		return err
	}

	srv := httpserver.NewServer(httpserver.ServerConfig{
		Addr:              cfg.HTTP.Addr,
		ReadHeaderTimeout: cfg.HTTP.ReadHeaderTimeout,
		ReadTimeout:       cfg.HTTP.ReadTimeout,
		WriteTimeout:      cfg.HTTP.WriteTimeout,
		IdleTimeout:       cfg.HTTP.IdleTimeout,
	}, handler, log)
	return httpserver.Run(ctx, srv, health, cfg.HTTP.ShutdownTimeout, log)
}

// newHandler wires the modules and returns the HTTP handler and the health
// probes. It is separate from run so the end-to-end test serves exactly the
// production wiring.
func newHandler(ctx context.Context, cfg config.Config, pool *pgxpool.Pool, rdb *goredis.Client, log *slog.Logger) (http.Handler, *httpserver.Health, error) {
	spec, err := httpserver.LoadSpec(ctx, api.Spec)
	if err != nil {
		return nil, nil, err
	}

	identityModule := identity.New(identity.Deps{
		Pool:            pool,
		Logger:          log,
		JWTSecret:       cfg.Auth.JWTSecret,
		Issuer:          cfg.Auth.Issuer,
		Audience:        cfg.Auth.Audience,
		AccessTokenTTL:  cfg.Auth.AccessTokenTTL,
		RefreshTokenTTL: cfg.Auth.RefreshTokenTTL,
	})
	catalogModule := catalog.New(catalog.Deps{
		Pool:   pool,
		Redis:  rdb,
		Logger: log,
	})

	health := httpserver.NewHealth(2*time.Second, map[string]httpserver.Check{
		"postgres": pool.Ping,
		"redis":    redis.Ping(rdb),
	})
	var docs []byte
	if cfg.HTTP.DocsEnabled {
		docs = api.Spec
	}
	router := httpserver.NewRouter(httpserver.RouterConfig{
		Logger:             log,
		RequestTimeout:     cfg.HTTP.RequestTimeout,
		MaxBodyBytes:       cfg.HTTP.MaxBodyBytes,
		CORSAllowedOrigins: cfg.HTTP.CORSAllowedOrigins,
		Authenticator:      identityModule,
		Health:             health,
		Spec:               docs,
	})
	validator := httpserver.RequestValidator(spec, log)
	identityModule.Mount(router, validator)
	catalogModule.Mount(router, validator)
	return router, health, nil
}
