# Security Advisories

**ALL agents must read this index before:**
- Installing or updating dependencies (`npm install`, `pnpm add`, `yarn add`, etc.)
- Reviewing code that imports external packages
- Generating or modifying lockfile changes
- Reading or writing inside `.claude/` or `.vscode/` directories of any project

If any advisory matches a package or IOC in the current task → **STOP and report to the user before proceeding.**

---

## Active Advisories

| ID | Package / Vector | Severity | Date | Status |
|----|------------------|----------|------|--------|
| [ADV-2026-001](axios-incident-response.md) | axios | CRITICAL | 2026-03-31 | Active |
| [ADV-2026-002](react-rce-incident-response.md) | react / react-server-dom-* | CRITICAL | 2026-02 | Active |
| [ADV-2026-003](tanstack-mini-shai-hulud-incident-response.md) | @tanstack/* (react-router, router-core, +80 packages) | CRITICAL | 2026-05-12 | Active |
| [ADV-2026-004](nodejs-oct-2026-security-release.md) | Node.js runtime (22.x, 24.x, 26.x; 18/20 EOL) | HIGH | 2026-10-21 | Active |
| [ADV-2026-005](php-sep-2026-security-release.md) | PHP runtime (8.2-8.5) | HIGH | 2026-09-24 | Active |
| [ADV-2026-006](python-oct-2026-security-release.md) | Python runtime (3.10-3.14; 3.10 now EOL) | HIGH | 2026-10-01 | Active |
| [ADV-2026-007](java-oct-2026-security-release.md) | Java SE / OpenJDK runtime (8, 11, 17, 21, 25, 27) | HIGH | 2026-10-20 | Active |
| [ADV-2026-008](tailscale-ssh-tailworm-oct-2026.md) | Tailscale SSH server + port forwarding ("Tailworm") | HIGH | 2026-10-26 | Active |
| [ADV-2026-009](linux-kernel-tcp-cve-2026-98432.md) | Linux kernel TCP use-after-free CVE-2026-98432 (MPTCP root PoC) | CRITICAL | 2026-10 | Active |
| [ADV-2026-010](claude-code-extension-2-1-313-backdoor.md) | anthropic.claude-code editor extension 2.1.313 (Open VSX / Cursor): SSH backdoor | CRITICAL | 2026-10-29 | Active |

---

## How to Check

For each advisory marked **Active**:
1. Read the advisory file for affected versions and IOCs.
2. Search the project lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) for those exact versions.
3. Scan the filesystem for IOC filenames listed in the advisory (especially inside `.claude/` and `.vscode/`).
4. If any match is found → halt, report finding with file:line, do not proceed.

For **runtime** advisories (Node.js, PHP, Python, Java), lockfile scans do not apply: check Docker `FROM` images, `.nvmrc` / `.node-version`, CI `node-version` / `php-version`, and `node -v` / `php -v` against the advisory's fixed versions.

For **infrastructure** advisories (Tailscale, Linux kernel), check the hosts, not the repo: `tailscale version` / `tailscale debug prefs` on each node, `uname -r` on each Linux host or VM (including Docker Desktop / OrbStack and Fly machines). Record what you checked in the advisory's "Environment state" section of your global copy (`~/.claude/advisories/`).

---

## Per-Project Overrides

Some projects mirror these advisories under `<project>/.claude/advisories/` with project-specific notes. When both exist, treat the project file as additive — global rules still apply.
