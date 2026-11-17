# Pipeline Postmortems — bank

**Purpose:** a retrospective log of (1) **severe** defects (security, performance,
data-correctness, availability, code-quality) that **passed every gate of the caw pipeline** —
planner → coder → tester → reviewer, via `/caw-plan`, `/caw-code`, `/caw-run` — and were found only
after the fact (Parts A/B), and (2) **round-cap overrides** — a task the user force-completed after
`rules/common/leader-discipline.md`'s 3-round fix-loop cap tripped with findings still open (Part
C). Neither is a bug list: an A/B entry is already fixed, a C entry is already resolved one way or
the other. Its only purpose is to improve the harness itself — the rule files under `.claude/rules/`,
the ADR conventions, and how the agents work — so the *class* of failure does not recur.

**Verification principle:** every number, symbol, file, commit hash, and ADR reference in this file
was `Read`/`Grep`/`git show`n in the session that wrote it (see
`.claude/rules/common/harness-contract.md` § Claims), not recalled or inferred. Anything not fully
verified is marked **unverified** rather than asserted. Never copy a count from an older line —
recount with `grep -cE '^### A[0-9]+'` / `grep -cE '^### B[0-9]+'` when you need one.

**Structure:**
- **Part A** — defects that **reached a deployed environment** (dev / staging / production) and
  were discovered only after the code ran for real. This is the primary section.
- **Part B** — **near-misses**: a defect that was written or designed, but caught **before ship** by
  an out-of-band audit (a user-requested re-audit, a side investigation) rather than by a standard
  pipeline gate. Blast radius was zero, but the pipeline weakness is identical. Kept clearly
  separate so it is never confused with Part A.
- **Part C** — **round-cap overrides**: a task/stage/phase where 3 fix-loop rounds
  (`rules/common/leader-discipline.md` § Fix loop) still left findings open and the user chose to
  proceed anyway (force-complete as-is, force-complete with a manual fix, or abandon). Not a defect
  report — logs *why the loop didn't converge*, so the harness can learn the same way it does from
  Parts A/B.
- **Summary table** — directly below, before any entry. Scan it first; open only the entries whose
  table/module/pattern matches what you are working on.

**Rules for this file:**
1. Whoever hot-fixes a deployed environment **appends the entry in the same PR** as the hot-fix.
2. The summary table is updated **in the same edit** as the entry — never later.
3. Every entry names the pattern it fits in `.claude/rules/common/review-discipline.md` § After a severe defect,
   or states that it is a new class (and proposes the pattern there). Fill `Hub target` in the same edit
   whenever that pattern generalizes into a hub-owned file (`agents/*.md`, `rules/common/*.md`,
   `commands/*.md`, `templates/skills/*`) — `project` if the fix only makes sense in this codebase.
4. Planner reads the rows whose table/module matches the task before writing a plan for it.
5. Routine harness friction that never shipped a defect goes to `harness-backlog.md`, not here.
6. Maintainer triage reads rows whose `Hub target` ≠ `project` and `Upstreamed` is `—`, ports them to
   caw, fills `Upstreamed` with the hub commit hash — same protocol as `harness-backlog.md`, and the
   same `.claude/scripts/sync-hb-to-hub.sh` pushes both into the hub's `docs/hb-inbox.md` (marked
   `PM-<id>` there to keep provenance and severity visible).
7. A round-cap override gets a Part C entry, appended by the leader **in the same turn** the
   override happens (`rules/common/leader-discipline.md` § Fix loop). If this project's copy of this
   file predates Part C, create the section (and its summary-table count line) the same turn, same
   as `backlog.md`'s `## Closed` section is created on first use.

---

## Summary table

| # | Incident | Severity | Category | Pipeline-level fix in place? | Hub target | Upstreamed |
|---|---|---|---|---|---|---|
| — | _(no entries yet)_ | | | | | |

**Part A count:** recount with `grep -cE '^### A[0-9]+'` — do not hardcode.
**Part B count:** recount with `grep -cE '^### B[0-9]+'` — do not hardcode.
**Part C count:** recount with `grep -cE '^### C[0-9]+'` — do not hardcode.

---

## Entry template

Copy this block; `A<N>` for Part A, `B<N>` for Part B. Number sequentially within each part. Part
C uses its own, simpler template — see below.

```md
### A<N> — <short title naming the table/module and the user-visible effect>

- **Date:** <YYYY-MM-DD discovered> (shipped <YYYY-MM-DD>, if known)
- **Severity:** CRITICAL | HIGH | MEDIUM-HIGH — <one clause why>
- **Category:** security | performance | data-correctness | availability | compliance | process
- **Environment reached:** production | staging | dev | (Part B: none — caught at <plan/code/review>)
- **Gate that should have caught it:** planner | coder self-verify | tester (Tier-1/Tier-2) | reviewer | smoke — and the mechanism of the miss
- **Root cause at the pipeline level:** <why the gate structurally could not see it — not the code bug itself>
- **Fix applied (code):** <commit / PR>
- **Harness fix applied / proposed:** <rule file + section changed, gate added, or "proposed: …">
- **Pattern:** consumers drift | Tier-1 mock hid a limit | rule tightened late (review-discipline.md § After a severe defect) | new class — <one line>
- **Occurrence:** first | recurrence of <A<M>/B<M>> — if recurrence, the class rule must be generalized in this same PR

`Hub target`/`Upstreamed` are **not** entry fields — they live only in the Summary table row
above (same split as `harness-backlog.md`'s index vs. detail). `sync-hb-to-hub.sh` and
`harness-backlogs.sh` read the table, never this entry body; filling a "Hub target" here
instead of in the row would leave the item invisible to both.
```

---

## Part A — Reached a deployed environment

_(append entries here)_

---

## Part B — Near-misses caught out-of-band

_(append entries here)_

---

## Part C — Round-cap overrides

Copy this block; `C<N>`, numbered sequentially.

```md
### C<N> — <task-id> [phase] stuck at round 3 — <plan|code|verify>

- **Date:** <YYYY-MM-DD>
- **Stage / round table:** see `tasks/<task-id>/leader.md` § Stage <n>
- **Open finding(s) at round 3:** <what was still failing, one line each>
- **User's decision:** force-completed as-is | force-completed with a manual fix | abandoned
- **Why it didn't converge:** thrashing (fixed, broke again) | genuinely hard | plan defect |
  leader/peer miscommunication | other — one line
- **Harness fix applied / proposed:** <rule file + section, or "proposed: …", or "none — one-off">
```

_(append entries here)_
