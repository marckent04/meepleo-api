// Package catalog is the catalog module: game sheets, structured rules and
// barcode lookup, with sheets of unknown barcodes generated in the background.
//
// This file is the module's public face for the composition root: it wires
// the module's adapters together and exposes the HTTP routes, the worker and
// the contract.API used by other modules. Nothing outside the module imports
// its domain, app or adapters packages.
package catalog

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"

	"github.com/meepleo/meepleo-api/internal/catalog/adapters/in/httpapi"
	"github.com/meepleo/meepleo-api/internal/catalog/adapters/in/worker"
	"github.com/meepleo/meepleo-api/internal/catalog/adapters/out/claudeapi"
	"github.com/meepleo/meepleo-api/internal/catalog/adapters/out/postgres"
	"github.com/meepleo/meepleo-api/internal/catalog/adapters/out/rediscache"
	"github.com/meepleo/meepleo-api/internal/catalog/app"
	"github.com/meepleo/meepleo-api/internal/catalog/contract"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// Deps are the dependencies of the module.
type Deps struct {
	Pool   *pgxpool.Pool
	Redis  *goredis.Client
	Logger *slog.Logger
	Now    func() time.Time
	// CacheTTL bounds how long a sheet or a barcode answer stays in Redis.
	CacheTTL time.Duration
	// PollDelay is the delay suggested to clients polling a pending barcode.
	PollDelay time.Duration
}

// Module is the catalog module.
type Module struct {
	deps   Deps
	repo   *postgres.Repository
	svc    *app.Service
	server *httpapi.Server
}

var _ contract.API = (*Module)(nil)

// New wires the module.
func New(d Deps) *Module {
	if d.Now == nil {
		d.Now = time.Now
	}
	if d.CacheTTL <= 0 {
		d.CacheTTL = time.Hour
	}
	if d.PollDelay <= 0 {
		d.PollDelay = 20 * time.Second
	}
	log := d.Logger.With(slog.String("module", "catalog"))
	d.Logger = log

	repo := postgres.NewRepository(d.Pool)
	games := rediscache.NewCachedGames(repo, d.Redis, d.CacheTTL, d.Now, log)
	svc := app.NewService(games, repo, d.Now, d.PollDelay)
	return &Module{deps: d, repo: repo, svc: svc, server: httpapi.NewServer(svc, log)}
}

// Mount registers the catalog HTTP routes behind validator.
func (m *Module) Mount(r chi.Router, validator func(http.Handler) http.Handler) {
	httpapi.Mount(r, m.server, validator)
}

// Game implements contract.API.
func (m *Module) Game(ctx context.Context, id string) (contract.GameSummary, error) {
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil || n <= 0 {
		return contract.GameSummary{}, contract.ErrGameNotFound
	}
	g, err := m.svc.Game(ctx, domain.GameID(n))
	if errors.Is(err, domain.ErrGameNotFound) {
		return contract.GameSummary{}, contract.ErrGameNotFound
	}
	if err != nil {
		return contract.GameSummary{}, err
	}
	return contract.GameSummary{
		ID: id, Name: g.Name, Publisher: g.Publisher, MinPlayers: g.Players.Min, MaxPlayers: g.Players.Max,
	}, nil
}

// WorkerConfig configures the generation worker.
type WorkerConfig struct {
	// Generator is the sheet generator; NewClaudeGenerator builds the
	// production one. Tests pass a fake.
	Generator    app.SheetGenerator
	DailyBudget  int
	Lease        time.Duration
	MaxAttempts  int
	RetryAfter   time.Duration
	PollInterval time.Duration
}

// Worker runs the generation queue.
type Worker interface {
	Run(ctx context.Context) error
}

// NewWorker returns the generation worker. Its writes go through the cache
// decorator so that stored answers invalidate the cached ones.
func (m *Module) NewWorker(cfg WorkerConfig) Worker {
	tx := rediscache.NewCachedTx(m.repo, m.deps.Redis, m.deps.Logger)
	gen := app.NewGenerator(m.repo, m.repo, cfg.Generator, tx, m.deps.Now, app.GeneratorConfig{
		DailyBudget: cfg.DailyBudget,
		Lease:       cfg.Lease,
		MaxAttempts: cfg.MaxAttempts,
		RetryAfter:  cfg.RetryAfter,
	})
	return worker.New(gen, m.deps.Logger, cfg.PollInterval)
}

// ClaudeConfig configures the production sheet generator.
type ClaudeConfig struct {
	APIKey  string
	BaseURL string
	Model   string
}

// NewClaudeGenerator returns the sheet generator backed by the Claude API.
// httpClient must be a dedicated resilient client (platform/httpclient).
func NewClaudeGenerator(cfg ClaudeConfig, httpClient *http.Client) app.SheetGenerator {
	return claudeapi.New(claudeapi.Config{APIKey: cfg.APIKey, BaseURL: cfg.BaseURL, Model: cfg.Model}, httpClient)
}
