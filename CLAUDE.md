# CLAUDE.md

REST API in Go, hexagonal architecture, modular monolith. This file defines the rules you must follow on every change. If one of these rules conflicts with your usual habits, the rule here wins. If a rule blocks you, ask me before working around it.

## Context

- Language: Go (latest stable version)
- REST API documented with OpenAPI, spec-first approach (`api/openapi.yaml`), Swagger UI served at `/docs`
- PostgreSQL (pgx + sqlc), Redis (go-redis), calls to external APIs
- The API will grow significantly: module boundaries matter more than the speed of shipping a single feature.

## Commands

```
make build      # compile
make test       # unit tests
make test-int   # integration tests (testcontainers)
make lint       # golangci-lint + architecture boundary checks
make generate   # oapi-codegen + sqlc
make migrate    # apply migrations
make run        # run the API locally (docker-compose for Postgres/Redis)
```

Before considering a task done: `make generate`, `make lint` and `make test` must pass. Never say "done" without having run them.

## Project structure

```
cmd/api/main.go               # composition root: the only place that wires everything
api/openapi.yaml              # contract, source of truth for the API
internal/
  <module>/                   # one folder per business context (bounded context)
    domain/                   # entities, value objects, rules, business errors
    app/                      # use cases + ports (interfaces)
    adapters/
      in/httpapi/             # handlers, DTOs, mapping, HTTP errors
      out/postgres/           # repositories
      out/rediscache/         # cache decorators
      out/<partner>api/       # external API clients
    module.go                 # public API of the module (constructor, facade)
  platform/                   # config, logger, HTTP server, observability, shared clients
migrations/
```

## Architecture rules (non-negotiable)

### Dependencies
1. Dependencies always point inward: `adapters` → `app` → `domain`.
2. `domain` imports **no** external library (no pgx, redis, chi, or serialization lib). Standard library only (`errors`, `time`, `context` if truly needed, etc.).
3. `app` imports only the `domain` of the same module and the standard library. Never an adapter.
4. Only `cmd/api/main.go` and `module.go` know the concrete implementations.
5. No circular dependencies between packages or between modules.

### Ports and adapters
6. Ports (interfaces) are declared **on the consumer side**, in `app/`, and stay small (1 to 5 methods). No catch-all interfaces.
7. Only create an interface when there is a real need (second adapter, decorator, test). Otherwise use the concrete type.
8. No `json`, `db` or `validate` tags in `domain`. Each adapter has its own models (HTTP DTOs, sqlc structs) and maps explicitly to the domain.
9. Caching is a **decorator** of a port (e.g. `CachedOrderRepository` wrapping the Postgres repository). The business service never knows there is a cache.
10. Business errors are defined in `domain` (`ErrNotFound`, `ErrConflict`...). They are translated to HTTP status codes only in `adapters/in/httpapi`. Never leak a SQL, Redis or outgoing HTTP error to the client: wrap it with `fmt.Errorf("...: %w", err)` and map it.

### Modules
11. A module **never** imports the internal packages of another module (`domain`, `app`, `adapters`). It only goes through that module's public API (`module.go` or a `contract` package).
12. A module **never** accesses another module's tables. If you need data from another module, go through its public API or an event.
13. A new business context = a new folder under `internal/`, with the same structure. Do not put business logic in `platform/`.
14. No global `utils`, `common`, `helpers`, `models` or `interfaces` packages. Split by business domain, not by technical type.
15. Think about extraction: a module must be able to become a separate service by only replacing its public API with a network client.

### Wiring
16. Manual dependency injection through constructors (`NewService(repo Repository, ...)`). No DI framework, no global variables, no `init()` with side effects.
17. Constructors return concrete types and accept interfaces.

## API and OpenAPI

- The contract is the source of truth: **edit `api/openapi.yaml` first**, then run `make generate`, then implement. Never edit generated files by hand.
- Every new route has its request, response and error schemas documented in the YAML.
- Uniform error format (RFC 7807 `application/problem+json` or the format defined in the YAML). No plain-text errors.
- Pagination, sorting and filtering follow the conventions already in the contract. Do not invent a new convention per endpoint.
- A breaking contract change (removed field, changed type) must be flagged explicitly and discussed beforehand.

## Database

- SQL is written by hand in sqlc files, never built dynamically by string concatenation. Queries are always parameterized.
- Every schema change goes through a new migration. Never edit a migration that has already been applied.
- Migrations must be backward compatible with the previous version of the code (rolling deployments): add first, remove in a later migration.
- Transactions are driven by the `app` layer (via a `UnitOfWork` or `TxManager` port), not by HTTP handlers.
- Context and timeouts on all queries.

## Cache (Redis)

- Prefixed and versioned keys: `<module>:<entity>:v1:<id>`.
- Always set a TTL. Never cache without expiration.
- A Redis error must **never** fail the request: log it and fall back to the source of truth.
- Explicit invalidation on write, in the same decorator. Document the strategy in the package comment.
- Never cache sensitive data (tokens, passwords, personal data) without explicit approval.

## External APIs

- One client per partner in `adapters/out/<partner>api/`, behind a port defined in `app`.
- Dedicated `http.Client` with an explicit timeout. Never `http.DefaultClient`.
- Retries with exponential backoff and jitter, only on retryable errors and idempotent methods. Add a circuit breaker if the API is unstable.
- The partner's model never leaves the adapter: convert it to a domain model.
- Secrets come from config, never from code. Never log `Authorization` headers or bodies containing sensitive data.

## Go best practices

- `context.Context` is the **first parameter** of any function that does I/O. Never store it in a struct. Propagate it down to DB, Redis and HTTP calls.
- Error handling: `fmt.Errorf("context: %w", err)`, `errors.Is` / `errors.As`. No `panic` outside `main` (and `recover` in middleware). An error is handled **or** logged, never both at the same level.
- No goroutine without an owner: every goroutine has a way to stop (context, `errgroup`) and its errors are propagated.
- No mutable global state. No hardcoded `time.Now()` in the domain: inject a clock when tests depend on it.
- Short, idiomatic names, no stuttering (`order.Service`, not `order.OrderService`).
- Public functions have a GoDoc comment. Comment the **why**, not the what.
- Make the zero value useful when possible, keep domain structs immutable when reasonable, validate in constructors (`order.New(...)` returns an error if an invariant is violated).
- Logging with `log/slog`, structured, with `request_id`. No personal data or secrets in logs.
- Config through environment variables, validated at startup (the program refuses to start if it is invalid).
- No dependency added without a reason: prefer the standard library. Justify any new dependency and check that it is maintained.

## Tests

- The domain and `app` services are covered by fast unit tests, with hand-written fakes for ports (no generated mocks unless clearly needed).
- Postgres, Redis and HTTP adapters are covered by integration tests (`testcontainers-go`), never by mocking `pgx` or `redis`.
- Table-driven tests (`t.Run`), `t.Parallel()` when safe, no `time.Sleep`.
- Every bug fix starts with a test that reproduces it.
- Handlers are tested via `httptest`, checking status, body and error format.
- A failing test is never deleted or disabled just to "make it pass". Fix the cause.

## Security

- Validate all inputs at the boundary (HTTP adapter), then enforce invariants in the domain.
- Limit request body size and set server timeouts (`ReadHeaderTimeout`, etc.).
- Authentication/authorization in middleware; permission checks in the `app` layer, not only in the handler.
- No plaintext secrets in the repository, logs, tests or fixtures.
- Update vulnerable dependencies (`govulncheck` in CI).

## Observability and operations

- `/healthz` (liveness) and `/readyz` (readiness, checks Postgres and Redis) endpoints.
- Graceful shutdown: `signal.NotifyContext` + `server.Shutdown` with a timeout.
- Middleware order: request ID, recover, logging, timeout, CORS, auth.
- OpenTelemetry metrics and traces on HTTP entry points, DB queries and outgoing calls.

## How to work

- **Before coding** a non-trivial feature: state in a few lines which module it goes in, which ports it adds and which files it touches. If it crosses a module boundary, stop and ask.
- Make small, targeted changes. Do not refactor unrelated code; flag it instead.
- Do not rename or move packages without an explicit request.
- Follow the repository's existing style before introducing a new pattern.
- When an important architecture decision is made (new module, new dependency, new pattern), add a short ADR in `docs/adr/NNNN-title.md` (context, decision, consequences).
- Do not misrepresent the state of the work: if something is untested, does not compile or is partial, say so clearly.
- If a request contradicts these rules, explain the conflict and propose a compliant alternative before executing.

## Git

- Commits in English, Conventional Commits format (`feat(orders): add cancel endpoint`, `fix(cache): handle redis timeout`).
- One commit = one logical change. Never commit with failing tests or a failing `make lint`.
- Do not commit or push unless I ask you to.