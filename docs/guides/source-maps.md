# Runtime source maps

The repository's main development and minified runtime bundles retain external
version 3 source maps. Their `sources`, `names`, and `mappings` are preserved, but
the optional `sourcesContent` field is omitted to avoid duplicating the engine
source in each artifact. `tools/build/build.cjs` applies this policy on every
normal or variant engine build.

For source-level debugging, serve or retain `build/` together with the matching
checkout's `src/` directory. The normal repository maps resolve `../src/...`
relative to the map URL, so a deployment under `/project/build/` needs the same
source files under `/project/src/`. The repository development server exposes
`/src/` as read-only original TS/JS bytes for this purpose, without transpilation;
it rejects traversal and symlinks outside the source directory. Keep the exact source revision, including
vendor files; do not combine a bundle with another revision's sources. A custom
output directory uses the build script's existing relative-source resolution.

A standalone copy of `build/` still runs, but no longer contains embedded source
text for offline debugging. A server must make the matching sources available
to developer tools for source display. The runtime itself does not load them.

The npm package is unchanged: prepack removes `sourceMappingURL` from its copied
runtime bundles and does not publish these maps. Do not copy repository maps
into `build/npm/`, where the relative source paths would mean something else.
