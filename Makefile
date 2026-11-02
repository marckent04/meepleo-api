# Meepleo API. Before considering a change done: make generate lint test.

TOOLS   := go tool -modfile=tools.mod
MODULES := catalog identity
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)

# Local configuration (copy .env.example to .env).
-include .env
export

.PHONY: help build test test-int lint generate migrate seed run run-worker up down vuln docker-build

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

build: ## Compile api, worker and migrate into bin/
	CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/ ./cmd/...

test: ## Unit tests
	go test -race ./...

test-int: ## Unit + integration tests (needs Docker for testcontainers)
	go test -race -tags=integration ./...

lint: ## golangci-lint + architecture boundary checks
	golangci-lint run ./...
	go run ./tools/archcheck

generate: ## oapi-codegen (one package per module) + sqlc
	@for m in $(MODULES); do \
		echo "oapi-codegen $$m"; \
		$(TOOLS) oapi-codegen -config internal/$$m/adapters/in/httpapi/oapi-codegen.yaml api/openapi.yaml || exit 1; \
	done
	$(TOOLS) sqlc generate

migrate: ## Apply the migrations of every module
	go run ./cmd/migrate

seed: ## Load demo game sheets into the local database
	docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U meepleo -d meepleo < scripts/dev-seed.sql

up: ## Start Postgres and Redis
	docker compose up -d --wait postgres redis

down: ## Stop the local stack
	docker compose down

run: up ## Run the API locally
	go run ./cmd/api

run-worker: up ## Run the generation worker locally (needs ANTHROPIC_API_KEY)
	go run ./cmd/worker

vuln: ## Known vulnerabilities in dependencies
	$(TOOLS) govulncheck ./...

docker-build: ## Build the container image
	docker build --build-arg VERSION=$(VERSION) -t meepleo-api:$(VERSION) .
