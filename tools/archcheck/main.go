// Command archcheck enforces the architecture rules that depguard cannot
// express because they are relative to the module a package belongs to:
//
//   - domain and contract import the standard library only;
//   - app imports the standard library and its own module's domain only;
//   - a module reaches another module only through its contract package;
//   - outside internal/, only module roots (wiring) and contracts are visible;
//   - platform never imports a business module;
//   - no catch-all package names (utils, common, models...).
//
// It reads `go list -json` (integration test files included) and exits 1 on
// any violation.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "archcheck:", err)
		os.Exit(1)
	}
}

func run() error {
	root, err := goList("-m")
	if err != nil {
		return err
	}
	out, err := goList("-tags=integration", "-json", "./...")
	if err != nil {
		return err
	}
	var pkgs []Package
	dec := json.NewDecoder(strings.NewReader(out))
	for {
		var p Package
		if err := dec.Decode(&p); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			return fmt.Errorf("decode go list output: %w", err)
		}
		pkgs = append(pkgs, p)
	}

	violations := checker{root: strings.TrimSpace(root)}.Check(pkgs)
	for _, v := range violations {
		fmt.Fprintln(os.Stderr, v)
	}
	if len(violations) > 0 {
		return fmt.Errorf("%d architecture violation(s)", len(violations))
	}
	fmt.Printf("archcheck: %d packages, no violation\n", len(pkgs))
	return nil
}

func goList(args ...string) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(context.Background(), "go", append([]string{"list"}, args...)...) //nolint:gosec // fixed command, arguments come from this program
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("go list %s: %w: %s", strings.Join(args, " "), err, stderr.String())
	}
	return stdout.String(), nil
}
