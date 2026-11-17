---
paths:
  - "**/leader-known-patterns.md"
---
# Leader — known concurrency failure patterns

Not loaded automatically — the `paths:` above never matches a real edit on
purpose. `leader-discipline.md § Known concurrency failure patterns` points
here when a stage's result looks anomalous in a way its four rungs don't
explain; `Read` this file then, not before. This is where a recognized
concurrency-only failure class gets written up once it's confirmed, so the
next leader recognizes it in minutes instead of burning another full
investigation cycle. Growing this file costs nothing on the common path —
only on the (rare) turn where a leader actually needs it. Append new
patterns; never delete a confirmed one.

## ADR numbering collisions (concurrent planning)

Part of rung 2 whenever a plan stage created one or more ADRs, and mandatory whenever more than one planner peer ran in the same turn (Stage 1 fan-out, or the user asking to plan several tasks in parallel): `planner` has no `Bash` tool, so it cannot lock `decisions/` — two peers reading it at nearly the same moment can both claim the same `NNNN`. This is expected, not a peer mistake; do not send it back as a finding against either planner. Resolve it yourself, once, right here:

1. From `.claude/conductor/decisions/`: `for f in [0-9][0-9][0-9][0-9]-*.md; do head -1 "$f" | grep -q '^# \[RENUMBERED' && continue; basename "$f" | grep -oE '^[0-9]{4}'; done | sort | uniq -d` — any number printed is a still-unresolved collision. Skip files whose first line is a `[RENUMBERED]` stub (step 3 below) — that duplicate is intentional, already resolved, and not a new finding.
2. For each: `stat`/`ls -la` the colliding files — the **earlier mtime keeps the number**. Every other file sharing it gets renumbered to the next free number (recompute after each rename — never batch-guess two at once).
3. For each renumbered ADR: leave a stub at the old path (planner/coder may lack a delete tool) — one line, `# [RENUMBERED — see <new-path>]`, plus the reason — rather than deleting it.
4. `grep -rn "ADR-<old-NNNN>"` across every task's `plan.md`/`code.md`/`review.md` (not just the renumbered ADR's own task) and fix every reference — a stale citation left behind is a finding against whoever wrote it, found on a *later* pass instead of now.
5. Update `decisions/README.md`'s index row for every renumbered ADR, and add one line under it noting the collision + resolution so a future reader isn't confused by a gap or a stub.
6. File it as an `HB-NNN` row per `harness-contract.md`'s HB protocol — `target: rules/common/harness-contract.md` (or `agents/planner.md` if the fix under discussion is planner-side), since this is a recurring class, not a one-off (a `Bash`-capable role reserving/renumbering, or a deterministic pre-check before spawning parallel planners, are both fixes that belong in the hub, not this project). Skip only if an open HB row for this exact class already exists.

## Shared local infra contention (concurrent runs against one local dev DB)

Part of rung 3 when the verify commands hit a project's shared local dev database (a Postgres container, a SQLite file, or similar) that more than one process — leader, tester peer, reviewer peer — can reach at once: a sudden wide failure spread (many unrelated tests failing identically) can mean a second concurrent run is holding a lock, not that the code regressed. Before filing a wide spread as a finding: check for a second live process (`ps -ef`, or the DB's own lock view, e.g. Postgres `pg_locks`); if found, wait or serialize the runs, then re-run once clean before concluding anything.

**The second live process can be the leader's own, forgotten.** `ListAgents` only shows other sessions — a leader's own earlier `Bash` call (especially one run with a generous or default timeout against a slow/full test suite, `run_in_background` or one that simply outlived its own foreground call) can still be executing, redirected to a scratch file, minutes or turns later, and it holds real DB connections exactly like a peer's would. Before trusting any "second process" check, run `pgrep -fl <the test command's own name, e.g. pytest>` (or equivalent) yourself, not just `ListAgents` and not just the DB's own view — a query against `pg_stat_activity` shows *that* something is connected but not *whether it's yours*. Kill anything that is a leftover of the leader's own prior turns before drawing any conclusion from a run that follows.

## Consumers-block grep gone stale (concurrent coder editing the same shared file a planner just read)

Part of rung 2 when a plan's `## Consumers` block pastes a grep against a shared file (a DI container, a shared router/module list) that a *different, still-`coding`* task is actively editing in another peer session: the planner's pasted line numbers can stop matching the file within minutes, and a fresh re-grep can even show a symbol the plan's table never classified. This is not a planner mistake — the file was a moving target it had no way to lock. Do not send it back as a finding.

Resolve it yourself, once: (1) `git status --short <the file>` / `git diff --stat` — an uncommitted change to that exact file confirms a live editor, not a planner error; (2) check `ListAgents`/the task's `overview.yaml` for a peer on a *different* task with `status: coding` touching the same file; (3) re-run the plan's claimed conclusion (not just the raw grep) against the file's *current* state — the conclusion ("existing providers X/Y/Z unaffected") usually still holds even though the pasted line numbers/enumeration are stale, because the new symbol belongs to the other task's unrelated scope. If the conclusion still holds, note the staleness in `leader.md` and move on — don't burn a fix round re-deriving line numbers that will just drift again before code lands. If the conclusion does NOT hold (the new symbol *does* collide with something this plan's phases touch), that's a real finding, concurrency or not — send it back.

Distinguish this from a real citation defect: a static file with one commit in `git log` (no uncommitted diff, no concurrent `coding`-status peer) that a plan cites wrong is not this pattern — that's ordinary rung-2 fabrication/carelessness and gets sent back as a finding exactly per `harness-contract.md § Claims`, same turn, same peer, no exception.

## Whole-project checker fails on a file outside the phase being verified (concurrent coding)

Part of rung 3 when another peer is still coding — a sibling phase of an `--all` run, or a different task in the same tree: `tsc -b` and a full lint run cover the **whole project**, so they can report errors located entirely in a file someone else is mid-edit on, while the phase under verification is correct (confirmed live, two projects: errors all inside a sibling phase's file; errors all inside a file of a concurrently-`coding` unrelated task). Not a finding against either.

Resolve it yourself, once: (1) confirm every error location is outside the phase's own `files:`; (2) check the owner is still live and busy (`herdr tab list`, not only `ListAgents` — a tab can be mid-edit without registering as a messaging peer); (3) scope the checker to the phase's own files (`pnpm exec biome check <files>`; `tsc -b 2>&1 | grep <phase dirs>` empty). Re-run the full-project checker once after the whole group finishes, before the next group or Stage 3 — that is where a real cross-phase regression shows.
