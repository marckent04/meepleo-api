// Package migrations embeds the SQL migrations of every module and applies
// them with goose.
//
// Each module has its own directory, Postgres schema and goose version table
// (public.<module>_goose_db_version), so a module's migrations can move with it if it
// is ever extracted into its own service.
package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/database"
)

//go:embed */*.sql
var files embed.FS

// Modules lists the module migration directories, in application order.
var Modules = []string{"identity", "catalog"}

// Up applies every pending migration of every module.
func Up(ctx context.Context, db *sql.DB, log *slog.Logger) error {
	for _, module := range Modules {
		if err := up(ctx, db, module, log); err != nil {
			return err
		}
	}
	return nil
}

// UpModule applies the pending migrations of one module (used by the
// integration tests of that module).
func UpModule(ctx context.Context, db *sql.DB, module string) error {
	return up(ctx, db, module, slog.New(slog.DiscardHandler))
}

func up(ctx context.Context, db *sql.DB, module string, log *slog.Logger) error {
	dir, err := fs.Sub(files, module)
	if err != nil {
		return fmt.Errorf("migrations of %s: %w", module, err)
	}
	// The version table lives in public: it must exist before the module's
	// first migration creates the module schema.
	store, err := database.NewStore(database.DialectPostgres, module+"_goose_db_version")
	if err != nil {
		return fmt.Errorf("goose store for %s: %w", module, err)
	}
	provider, err := goose.NewProvider("", db, dir, goose.WithStore(store))
	if err != nil {
		return fmt.Errorf("goose provider for %s: %w", module, err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("migrate %s: %w", module, err)
	}
	for _, r := range results {
		log.InfoContext(ctx, "migration applied", slog.String("module", module), slog.String("file", r.Source.Path), slog.Duration("duration", r.Duration))
	}
	return nil
}
