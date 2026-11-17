# Tasks Registry

Product/feature work only — a task here becomes a real task when someone runs `/caw-plan` on it.
Friction with the caw harness itself (a missing rule, an ambiguous template field, a repeated
workaround in the agents' own process) does **not** go here — that's `harness-backlog.md`, a
different file with a similar name but a different audience (see its own header).

| Status | ID  | Title | Type | Lane | Stage | Created | Updated |
| ------ | --- | ----- | ---- | ---- | ----- | ------- | ------- |

<!--
Status symbols:
  [ ] pending     — Plan not yet written
  [~] in-progress — at least one stage has started
  [x] done        — reviewer approved (0 open findings)

Task types:
  feature  — new functionality
  bug      — fix existing issue
  chore    — maintenance, config, dependencies
  refactor — code improvement, no behavior change

Lanes (set by planner from blast radius — see agents/planner.md § Lane): tiny / standard / risky

Stages:
  plan / coding / testing / review / blocked / done

Who writes here (this table is NOT the live status board — that is
`/caw-status`, which reads every tasks/<id>/overview.yaml directly):
  - reviewer: adds a `[ ]` row for a pre-existing problem it found OUTSIDE the
    task's diff (never fixed in-task; see agents/reviewer.md Step 3)
  - humans: add rows for work that is decided but not yet planned
  - planner: only READS this file, to reject an id or scope that already exists

Example row:
  | [ ] | task-001-auth | User Authentication | feature | standard | plan | 2026-05-11 | 2026-05-11 |

A row becomes a real task when someone runs /caw-plan on it — flip it to [~]
then. When it ends, its fate is one of two, never both:
  - shipped (reviewer approved) → flip to [x], row stays here.
  - did NOT ship (superseded, dropped, deferred, merged into another task) →
    remove the row here and move it to the `## Closed` section below instead
    (same split `harness-backlog.md` uses for `## Resolved` — one file, one
    table for the live view, one table for the terminal-but-not-shipped one).
-->

## Closed

Tasks that ended without shipping: superseded, dropped, deferred, or merged into another task.
One line per task so `/caw-plan` can check a proposed id or scope against work that was already
decided (`grep -rn "task-<NNN>-" .claude/conductor/` covers this table same as the one above —
both live under `.claude/conductor/`). Task folders stay under `tasks/` untouched; only
`overview.yaml`'s `status:` moves to `closed` or `deferred` — both set by a human, never an agent
(`agents/planner.md` § Field rules) — with a comment pointing here.

| Task | Closed | Reason | Superseded by / note |
|---|---|---|---|
