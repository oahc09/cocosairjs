# Cocos AIR Skills

从 [cocosair/SKILL.md](cocosair/SKILL.md) 开始，它是本套技能的统一路由入口。

使用时先按路由说明确认当前环境，再选择与任务对应的主技能；仅在需要时读取直接依赖技能和相关 references，无需加载整个套件。

这些文件随 npm 包提供，不会自动安装到宿主。复制或安装到宿主时应保留目录结构，以便相对链接正常解析。

## Phase-one loading and distribution

Profile A always reads the complete [router](cocosair/SKILL.md) once. Choose one primary skill and only the direct dependencies needed for the current task. Stop when the task can be answered; do not read another same-topic reference for the same question. Index reads, environment pages, archives and repeated reads also count toward actual document input.

The generated [machine index](index.json) and [readable index](INDEX.md) use only each SKILL.md frontmatter and Reference map. Do not maintain a separate routing table. The [legacy index](cocosair/references/skill-index.md) remains a compatibility stub for at least two release cycles; its complete historical inventory is available on demand, not a second routing source.

Distribution is **A-only: copy the complete skills tree without changing its layout**. The three original representative closures (rendering, math and verification) each included 22 skills and 190 of 191 files, or 99.96984% of the original skill bytes. That provides no useful smaller-bundle benefit; no single-skill bundle command is implemented. The final full-tree copy is checked outside the checkout for exact file hashes and local navigation. A copied skill tree supplies guidance, not the engine, verification executables, examples, browsers or runtime installation. The Graphics/DOM verification reference carries its required commands and prerequisites locally.

## Metadata and maintenance

The manifest is suite-tool metadata; hosts do not inherit tool permissions or environment declarations from it. Each of the 22 skills retains its own host fields. Extended routing metadata and Chinese description support depend on the host and have not been established for every external consumer. Name and description remain the host-minimal fallback.

The index uses schema 2 and min_compatible_schema 2. A consumer seeing a schema above its supported maximum should fall back to name + description. A schema change requires synchronized validation and a complete index check. The generator sorts names and uses stable key order and formatting; generation must match in two clean locations.

Phase-one limits are 180 Unicode code points for description, 1,400 for full frontmatter including delimiters and LF, 4,000 UTF-8 bytes per subsystem entry, 4,200 for the router, and 2,000 code points per compact index record. KB means 1,000 bytes. Existing long references remain intact; the 12 KB reference and 6 KB slice limits belong to the unimplemented second phase.

For new content, use this ownership decision path. Before phase two is separately authorized, apply it to the nearest existing topic reference without starting a slicing or sharing migration:

1. If it answers an existing reading unit's question, append there. Once slicing is implemented, check 6 KB and split further by question if needed.
2. If it introduces a new question domain, give it its own topic reference. In the future sliced layout, add the next numbered slice and one question-led stub link in reading order.
3. If it spans two domains, separate the statements and cross-link them; avoid a mixed-topic reading unit.
4. If too small to stand alone, merge into the nearest domain with an explicit cross-link. Do not introduce a parallel slice index.

From a confirmed repository checkout, use `node tools/skills/gen-index.cjs --write` after editing frontmatter or Reference maps, then `--check`. All other ordinary validation commands are read-only; `verify-lossless.cjs --restore-check` and `check-p1.cjs --out` write only explicitly requested new isolated output directories. See the repository tooling guide for complete commands and evidence requirements.

Phase two still requires five working days and at least 20 complete real tasks, its demand thresholds, and separate authorization. Fixed routing/benefit exercises and synthetic tasks cannot fill that sample. No real-task observation is inferred from static measurements.
