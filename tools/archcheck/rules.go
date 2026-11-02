package main

import (
	"fmt"
	"slices"
	"strings"
)

// Package is the subset of `go list -json` used by the rules.
type Package struct {
	ImportPath   string
	Name         string
	Imports      []string
	TestImports  []string
	XTestImports []string
}

// Violation is a broken architecture rule.
type Violation struct {
	Package string
	Import  string
	Rule    string
}

func (v Violation) String() string {
	if v.Import == "" {
		return fmt.Sprintf("%s: %s", v.Package, v.Rule)
	}
	return fmt.Sprintf("%s imports %s: %s", v.Package, v.Import, v.Rule)
}

// forbiddenNames are catch-all package names (CLAUDE.md rule 14).
var forbiddenNames = []string{"utils", "util", "common", "helpers", "helper", "models", "interfaces", "misc"}

// location places a package in the architecture.
type location struct {
	module string // business module name, "platform", or "" outside internal/
	layer  string // domain, app, adapters, contract, or "" for the module root
	sub    string // rest of the path after the layer
}

type checker struct {
	root string // Go module path
}

func (c checker) locate(path string) (location, bool) {
	prefix := c.root + "/internal/"
	if !strings.HasPrefix(path, prefix) {
		return location{}, strings.HasPrefix(path, c.root)
	}
	parts := strings.SplitN(strings.TrimPrefix(path, prefix), "/", 3)
	loc := location{module: parts[0]}
	if len(parts) > 1 {
		loc.layer = parts[1]
	}
	if len(parts) > 2 {
		loc.sub = parts[2]
	}
	return loc, true
}

func isStdlib(path string) bool {
	first, _, _ := strings.Cut(path, "/")
	return !strings.Contains(first, ".")
}

// Check applies every rule to every package.
func (c checker) Check(pkgs []Package) []Violation {
	var out []Violation
	for _, p := range pkgs {
		if slices.Contains(forbiddenNames, p.Name) {
			out = append(out, Violation{Package: p.ImportPath, Rule: "catch-all package name; split by business domain instead"})
		}
		from, _ := c.locate(p.ImportPath)
		for _, imp := range p.Imports {
			out = append(out, c.checkImport(p.ImportPath, from, imp, false)...)
		}
		for _, imp := range append(slices.Clone(p.TestImports), p.XTestImports...) {
			out = append(out, c.checkImport(p.ImportPath, from, imp, true)...)
		}
	}
	return out
}

func (c checker) checkImport(pkg string, from location, imp string, test bool) []Violation {
	violation := func(rule string) []Violation {
		return []Violation{{Package: pkg, Import: imp, Rule: rule}}
	}
	to, internal := c.locate(imp)
	toModule := internal && to.module != "" && to.module != "platform"

	// Stdlib-only layers. Test files may use test libraries (testify).
	if !test && from.module != "" && from.module != "platform" {
		switch from.layer {
		case "domain", "contract":
			if !isStdlib(imp) && (to.module != from.module || to.layer != from.layer) {
				return violation(from.layer + " may only import the standard library")
			}
		case "app":
			sameModule := to.module == from.module && (to.layer == "domain" || to.layer == "app")
			if !isStdlib(imp) && !sameModule {
				return violation("app may only import the standard library and the domain of its own module")
			}
		}
	}

	if !toModule {
		return nil
	}
	switch {
	case from.module == "platform":
		return violation("platform must not depend on business modules")
	case from.module == to.module:
		return nil
	case from.module != "":
		// Another business module: only its public contract.
		if to.layer != "contract" {
			return violation("modules talk to each other only through the other module's contract package")
		}
	default:
		// Outside internal/ (cmd, api, migrations, tools): module root
		// (wiring) or contract, never the layers.
		if to.layer != "" && to.layer != "contract" {
			return violation("only the module root (module.go) and its contract are visible outside the module")
		}
	}
	return nil
}
