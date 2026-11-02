package app

import (
	"context"
	"errors"
	"time"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// memory is a hand-written in-memory implementation of every catalog port.
type memory struct {
	games       map[domain.GameID]domain.Game
	resolutions map[domain.Barcode]domain.BarcodeResolution
	queue       map[domain.Barcode]*queued
	attempts    []Attempt
	nextID      domain.GameID

	failOnSave error // makes SaveResolution fail, to test rollbacks
}

type queued struct {
	item        QueuedBarcode
	lockedUntil time.Time
	lastError   string
}

func newMemory() *memory {
	return &memory{
		games:       map[domain.GameID]domain.Game{},
		resolutions: map[domain.Barcode]domain.BarcodeResolution{},
		queue:       map[domain.Barcode]*queued{},
		nextID:      1,
	}
}

func (m *memory) ByID(_ context.Context, id domain.GameID) (domain.Game, error) {
	g, ok := m.games[id]
	if !ok {
		return domain.Game{}, domain.ErrGameNotFound
	}
	return g, nil
}

func (m *memory) Resolution(_ context.Context, code domain.Barcode) (domain.BarcodeResolution, bool, error) {
	r, ok := m.resolutions[code]
	return r, ok, nil
}

func (m *memory) Enqueue(_ context.Context, code domain.Barcode) error {
	if q, ok := m.queue[code]; ok {
		q.item.RequestCount++
		return nil
	}
	m.queue[code] = &queued{item: QueuedBarcode{Barcode: code, RequestCount: 1}}
	return nil
}

func (m *memory) Claim(_ context.Context, now time.Time, lease time.Duration) (QueuedBarcode, bool, error) {
	var best *queued
	for _, q := range m.queue {
		if q.lockedUntil.After(now) {
			continue
		}
		if best == nil || q.item.RequestCount > best.item.RequestCount {
			best = q
		}
	}
	if best == nil {
		return QueuedBarcode{}, false, nil
	}
	best.lockedUntil = now.Add(lease)
	return best.item, true, nil
}

func (m *memory) CountSince(_ context.Context, since time.Time) (int, error) {
	n := 0
	for _, a := range m.attempts {
		if !a.AttemptedAt.Before(since) {
			n++
		}
	}
	return n, nil
}

// WithinTx works on a copy and only publishes it on success, like a real
// transaction would.
func (m *memory) WithinTx(ctx context.Context, fn func(context.Context, Store) error) error {
	tx := m.clone()
	if err := fn(ctx, tx); err != nil {
		return err
	}
	*m = *tx
	return nil
}

func (m *memory) clone() *memory {
	c := *m
	c.games = map[domain.GameID]domain.Game{}
	for k, v := range m.games {
		c.games[k] = v
	}
	c.resolutions = map[domain.Barcode]domain.BarcodeResolution{}
	for k, v := range m.resolutions {
		c.resolutions[k] = v
	}
	c.queue = map[domain.Barcode]*queued{}
	for k, v := range m.queue {
		q := *v
		c.queue[k] = &q
	}
	c.attempts = append([]Attempt(nil), m.attempts...)
	return &c
}

func (m *memory) SaveGame(_ context.Context, g domain.Game, _ []byte) (domain.GameID, error) {
	g.ID = m.nextID
	m.nextID++
	m.games[g.ID] = g
	return g.ID, nil
}

func (m *memory) SaveResolution(_ context.Context, r domain.BarcodeResolution) error {
	if m.failOnSave != nil {
		return m.failOnSave
	}
	m.resolutions[r.Barcode] = r
	return nil
}

func (m *memory) Dequeue(_ context.Context, code domain.Barcode) error {
	delete(m.queue, code)
	return nil
}

func (m *memory) Reschedule(_ context.Context, code domain.Barcode, lastError string, lockedUntil time.Time) error {
	q, ok := m.queue[code]
	if !ok {
		return errors.New("not queued")
	}
	q.item.Attempts++
	q.lastError = lastError
	q.lockedUntil = lockedUntil
	return nil
}

func (m *memory) RecordAttempt(_ context.Context, a Attempt) error {
	m.attempts = append(m.attempts, a)
	return nil
}

// fakeGenerator returns a canned outcome and counts calls.
type fakeGenerator struct {
	gen   domain.Generation
	err   error
	calls int
}

func (f *fakeGenerator) Generate(_ context.Context, _ domain.Barcode) (domain.Generation, error) {
	f.calls++
	return f.gen, f.err
}
