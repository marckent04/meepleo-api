package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

const root = "example.com/app"

func TestRules(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		pkg     Package
		wantBad bool
	}{
		{"domain with stdlib", Package{ImportPath: root + "/internal/catalog/domain", Imports: []string{"errors", "time"}}, false},
		{"domain with a library", Package{ImportPath: root + "/internal/catalog/domain", Imports: []string{"github.com/jackc/pgx/v5"}}, true},
		{"domain importing platform", Package{ImportPath: root + "/internal/catalog/domain", Imports: []string{root + "/internal/platform/i18n"}}, true},
		{"domain test may use testify", Package{ImportPath: root + "/internal/catalog/domain", TestImports: []string{"github.com/stretchr/testify/assert"}}, false},
		{"app with own domain", Package{ImportPath: root + "/internal/catalog/app", Imports: []string{"context", root + "/internal/catalog/domain"}}, false},
		{"app with an adapter", Package{ImportPath: root + "/internal/catalog/app", Imports: []string{root + "/internal/catalog/adapters/out/postgres"}}, true},
		{"app with another module's domain", Package{ImportPath: root + "/internal/catalog/app", Imports: []string{root + "/internal/library/domain"}}, true},
		{"app with net/http is caught by depguard, stdlib here", Package{ImportPath: root + "/internal/catalog/app", Imports: []string{"net/http"}}, false},
		{"adapter with own app and libraries", Package{ImportPath: root + "/internal/catalog/adapters/out/postgres", Imports: []string{root + "/internal/catalog/app", "github.com/jackc/pgx/v5", root + "/internal/platform/postgres"}}, false},
		{"adapter with another module's contract", Package{ImportPath: root + "/internal/library/adapters/out/catalogmodule", Imports: []string{root + "/internal/catalog/contract"}}, false},
		{"adapter with another module's root", Package{ImportPath: root + "/internal/library/adapters/out/catalogmodule", Imports: []string{root + "/internal/catalog"}}, true},
		{"adapter with another module's app", Package{ImportPath: root + "/internal/library/adapters/out/catalogmodule", Imports: []string{root + "/internal/catalog/app"}}, true},
		{"cross-module test import is still forbidden", Package{ImportPath: root + "/internal/library/app", TestImports: []string{root + "/internal/catalog/domain"}}, true},
		{"contract with stdlib only", Package{ImportPath: root + "/internal/catalog/contract", Imports: []string{"context", "errors"}}, false},
		{"contract with a library", Package{ImportPath: root + "/internal/catalog/contract", Imports: []string{"github.com/google/uuid"}}, true},
		{"platform with a module", Package{ImportPath: root + "/internal/platform/httpserver", Imports: []string{root + "/internal/catalog/contract"}}, true},
		{"cmd with module roots and platform", Package{ImportPath: root + "/cmd/api", Imports: []string{root + "/internal/catalog", root + "/internal/platform/config"}}, false},
		{"cmd with a module layer", Package{ImportPath: root + "/cmd/api", Imports: []string{root + "/internal/catalog/domain"}}, true},
		{"cmd test with a module layer", Package{ImportPath: root + "/cmd/api", TestImports: []string{root + "/internal/catalog/app"}}, true},
		{"catch-all package name", Package{ImportPath: root + "/internal/catalog/utils", Name: "utils"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := checker{root: root}.Check([]Package{tt.pkg})
			if tt.wantBad {
				assert.NotEmpty(t, got)
			} else {
				assert.Empty(t, got)
			}
		})
	}
}
