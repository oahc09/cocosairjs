# project setup triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "Install from npm in a bundler app" -> `cocosair.js` package exports table in [entries.md](entries.md).
- "Static page, no bundler" -> importmap and skeleton rules in [html-shell.md](html-shell.md).
- "Custom canvas id or options-only DPR" -> the main entry accepts both at createAirApp time, including canvas creation after import. Use an application-owned dynamic main import when deferred loading is useful.
- "Paint live HTML into a `Texture2D`" -> `cocosair.js` (experimental HTML helpers in the main entry) + cocosair-graphics-and-dom.
- "Editor types fail on TypeScript < 5.0" -> `types@<5.0` / `typesVersions` conditions in [entries.md](entries.md).
- "Trim or extend what ships" -> `AIR_FEATURES` variant semantics in [feature-flags.md](feature-flags.md); a variant is a different candidate, not the default one.
- "Which command wrote this file under build/?" -> artifact ownership table in [entries.md](entries.md).
