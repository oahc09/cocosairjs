# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - owns the `cocosair.js` texture surface and DOM overlays once the entry is wired.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - which gates consume these build artifacts and how artifact drift is judged.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Install, import and type-consume Cocos AIR correctly: one startup path per page, the canvas bound before engine evaluation, the declarations the compiler can resolve, and a build candidate you can name.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Importing 'cocosair' from the installed package
- [HIGH] Taking the package surface from src/index.ts
- [MEDIUM] Using removed bootstrap/html-source package subpaths
- [MEDIUM] Treating a variant build as the default candidate

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Set up a Cocos AIR project end to end - install the cocosair.js npm package or build from source, choose among the main entry, cocosair.js and the experimental cocosair.js, write the importmap and the startup-bound canvas page skeleton, resolve TypeScript declarations on TS 4.9 and TS 5+ via the exports types conditions, map npm scripts to build artifacts, and run AIR_FEATURES/AIR_OUT_DIR variant builds without disturbing the default 26-feature candidate. Use when installing or importing cocosair.js, fixing unresolved-import or wrong-entry errors, wiring a page shell or editor types, or deciding which build command produces which file.

### Keywords

Cocos AIR, cocosair.js, project, setup

## References

- [entries.md](entries.md) - exports map, per-entry symbol surfaces, artifact ownership.
- [feature-flags.md](feature-flags.md) - default 26 units, the 7 unselected declared units, AIR_FEATURES/AIR_OUT_DIR semantics.
- [html-shell.md](html-shell.md) - page skeleton, importmap shape, startup canvas binding, dev server facts.

## Canonical docs

`docs/manual/installation.md`, `build/README.md`, `docs/reference/web-features.md`, `docs/manual/typescript-dom-compatibility.md`.
