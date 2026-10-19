# Actual skill-reading event collection

Phase one uses the frozen B1/B2 fixture and retained independent readings under `skills-token-evidence/recovery/`. The primary cost is Unicode document characters, `C = L0 + sum(read_chars)`; UTF-8 bytes and rough token estimates are separate columns. This is not provider billing usage.

## Real-task observation (M2)

No M2 sample has been collected by this implementation. Do not count T1 prompts, B1/B2, repetitions of the same task or synthetic exercises as real demand. Phase two needs five working days, at least 20 complete actual tasks, the demand criterion and separate approval. Insufficient observations remain insufficient evidence; there is no automatic extension or implementation.

For an authorized real task, manually record one completed JSON object per line in `ai/plans/skills-load-events.jsonl`. Do not save the user's question text, unrelated session content or credentials. Record task ID, timestamp, outcome, source/candidate snapshot hash, completion, and only actual reads. Use the exact L0 rendering and metric version from the measurement tool. Repeated reads are distinct events; unique-reference counts are a separate statistic.

Illustrative shape only, **not an execution record** (placeholders are intentionally invalid and must never be aggregated as evidence):

```json
{
  "task_id": "REPLACE_WITH_REAL_TASK_ID",
  "started_at": "REPLACE_WITH_ACTUAL_ISO_TIMESTAMP",
  "outcome": "REPLACE_WITH_ACTUAL_OUTCOME",
  "snapshot_hash": "REPLACE_WITH_VERIFIED_MANIFEST_HASH",
  "complete": false,
  "reads": [
    {
      "path": "skills/cocosair/SKILL.md",
      "content_hash": "REPLACE_WITH_ACTUAL_SHA256",
      "read_chars": 0,
      "read_bytes": 0,
      "whole_file": true,
      "fragments": []
    }
  ]
}
```

Whole-file hashes refer to exact UTF-8 bytes. For partial reads, set whole_file false and preserve actual line ranges and fragment hashes; compute cost from text really returned. A file existing on disk is not proof that the reader received it. Truncated tool output is incomplete evidence and cannot claim the whole-file cost or a successful task; retain it as a failure and collect a new bounded attempt if needed. Record failures and repeated reads rather than selecting the cheaper run.

For M2, run `node tools/skills/measure-tokens.cjs --loads ai/plans/skills-load-events.jsonl --snapshot <snapshot>` without `--scenarios`. Fixed-scenario gains must use the explicit frozen fixture, original source snapshot, matching question/protocol hashes, answer artifact and checked actual-reading receipts. Never mix scenario costs into M2 or infer a scenario from candidate logs.

The collection helper `ai/plans/skills-token-evidence/recovery/read-trial.cjs` writes only a new trial directory and sealed artifacts requested by its operator. It is used for fixed-scenario tests, not background monitoring. The measure tool is read-only and does not create readings or validate answer facts without retained checks and source evidence.
