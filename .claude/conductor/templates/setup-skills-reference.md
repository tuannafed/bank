# Setup Agent — Mandatory Default Skills Reference

Full per-group breakdown of the 17 mandatory default skills `agents/setup.md` Phase 2
requires on every project, code or not. Everything else is matched from the project itself by
`match-skills.py`: language-agnostic skills through the synthetic `@code` trigger (the project
has any code manifest), stack-specific skills through dependency or file triggers. The single
machine-readable source of truth is `<CAW_HOME>/scripts/data/skills-registry.json`; this file is
its human-readable mirror, checked for agreement by `scripts/checks/skills-registry.sh`.
Phase 4.1 reads the JSON file directly at install time — it does not hand-copy this list.

## Workflow defaults (4 skills — every project gets these)

- `to-prd`
- `code-review-excellence` *(the reviewer agent always loads it)*
- `verification-before-completion` *(evidence-before-assertions before claiming done)*
- `find-skills` *(setup Phase 3 loads it before searching the hub)*

## Product/PM defaults (7 skills — planner agent depends on these; absence will make `/caw-plan` abort)

- `prd-development`
- `user-story`
- `user-story-splitting`
- `prioritization-advisor`
- `business-analyst`
- `create-specification`
- `roadmap-planning`

## Cross-cutting defaults (1 skill)

- `github` *(every project we ship uses GitHub workflow)*

## caw-owned defaults (5 skills — sourced from `<CAW_HOME>/templates/skills/`)

- `commit-conventions`
- `context-engineering`
- `doubt-check`
- `feedback-traceability`
- `technical-doc-html` *(converts a Markdown spec/design doc to a standalone HTML deliverable)*

## Not defaults — matched by `match-skills.py`

- **Any project with code (`@code`):** `adversarial-test-design`, `test-driven-development`,
  `systematic-debugging`, `refactor`, `improve-codebase-architecture`, `security-audit`,
  `security-hardening`, `source-driven`, `observability`, `performance-optimization`,
  `error-handling-patterns`, `runtime-smoke-test`, `herdr-peer-delegate`.
- **By stack:** `nextjs-feature` (`next`), `package-manager` (a `package.json`),
  `accessibility` / `performance` (a web UI framework), `api-contract` (an HTTP framework),
  `github-actions` (`react-native` / `expo` — its content is React Native CI), plus every
  framework, library and tooling skill in the catalog.
- **Opt-in only (no trigger):** `validate-skills` — for people who author skills.
