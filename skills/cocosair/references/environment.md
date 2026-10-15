Derived from package.json, README.md, AGENTS.md, build/README.md and the suite's actual file layout; checked on 2026-10-11.

# Locate the working environment

Resolve the environment before interpreting a path or running a command. Skill installation does not install the runtime or automatically grant access to the engine source checkout.

## Application consuming npm

- The application root is the user's project; its package manager and build scripts belong to that application.
- Locate the installed `cocosair.js` package through the application's dependency resolution. Its package root contains `package.json`, `README.md`, shipped `docs/`, `skills/` and declarations under `build/`.
- Use `cocosair.js`, `cocosair.js` and `cocosair.js` imports with the application's bundler. The repository alias `cocosair` and `/build/` URLs work only with a matching importmap and server mapping.
- `src/`, `tools/`, `examples/`, `AGENTS.md` and Git metadata are not in the npm `files` list. Source annotations in references explain provenance; do not attempt to read those paths relative to the user's app or the host skill directory.
- Validate with the application's compiler, build and real browser. Repository `verify:*`, `gallery:*` and runtime-build scripts require a source checkout and are not consumer commands.
- Agent-session factories and `/__debug/` routes require repository development tooling; the runtime does not provide them as package exports.

## Engine source checkout

- Confirm the selected root contains the `cocosair.js` package identity together with `src/`, `tools/` and `AGENTS.md`. Resolve source annotations and canonical docs from this root, not from the current skill folder.
- Run repository npm commands from that root with installed development dependencies. Inspect command prerequisites and writes before running them. Use the repository's authoritative AGENTS.md command table when present.
- `/build/cocosair.module.js` snippets need an existing bundle and the repository development server. Builds, prepack and evidence collectors may write generated artifacts or advance build metadata; do not run them merely to read a skill.
- Validate only the affected behavior. A source/declaration claim, a default-bundle claim, a variant build and a current browser PASS are different claims.

## Copied host skills or missing dependencies

A copied skill folder is not a checkout or an installed package. Locate the application's installed package or the user-selected source checkout through the workspace context first. Read only relevant shipped docs/declarations or available source files. If neither is available, identify the missing dependency and continue only with self-contained guidance; do not invent a root, fetch a different baseline or call nonexistent tools.

Sibling links assume the suite's directory layout is preserved. For a standalone copied subsystem, the shared rules are: use package imports and shipped docs for consumers; use repository scripts and source paths only in a confirmed checkout. If a sibling skill is unavailable, consult the applicable canonical chapter instead and disclose that fallback.

## Path and freshness conventions

Relative Markdown links resolve from the containing skill/reference file. Backticked `docs/`, `build/`, `src/`, `tools/` and `examples/` paths resolve from the selected package or checkout root according to the rules above. Generated artifacts and historical evidence may be absent; their absence is not a reason to fabricate them.

Use relative Markdown links for navigation between skills and references, including links from one reference to a sibling reference. Cross-skill paths must identify the destination skill explicitly; the camera references link to the scene-graph [layers.md](../../cocosair-scene-graph/references/layers.md). Run `node skills/cocosair/scripts/check-paths.cjs` from the located checkout/package root after navigation changes. For a copied suite, run the script from its actual folder with an explicit `--root=<skills-directory>` if needed. The checker prints JSON and exits nonzero for missing targets or unlinked prose navigation paths; it leaves repository provenance and fenced code outside its scope.

Source file paths are stable locators; line numbers and recorded dates are search hints, not immutable identities. Re-read the directly relevant implementation when checking an error literal, hard limit or evidence contract. If source and older prose disagree, report the conflict and use the current implementation for its actual behavior. Do not claim browser verification from an old reference table.

The path checker accepts inline destinations (including angle brackets, URL encoding and balanced/escaped parentheses), double/single/parenthesized titles, and reference definitions. It ignores backtick/tilde fenced examples according to the opening marker and length, inline code examples and HTML comments. Code-formatted link labels remain valid navigation. Bare code-formatted navigation such as a dot-relative reference path must instead be a Markdown link. Empty scopes, scopes without `SKILL.md`, unreadable roots and malformed local URL encoding fail; `--selftest` covers these contracts in memory. External URLs and Markdown anchors are not resolved. This is a local navigation check, not a general Markdown linter or runtime gate.
