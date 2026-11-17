# ADV-2026-006: Python October 2026 Security Release — Runtime Patch Guide

**Severity:** HIGH (CVE-2026-19445 rated 9.2 by stack.watch; the post itself states no severities)
**Date:** 2026-10-01
**Type:** Runtime vulnerability (NOT a supply chain attack — lockfile scans do not detect it)
**Status:** Active
**Source:** https://blog.python.org/2026/10/python-31022-31117/

## Executive Summary

- CPython 3.10.22, 3.11.17, 3.12.15, 3.13.16 and 3.14.8 fix 8 CVEs in `ssl`, `tarfile`, `zipfile`,
  `urllib.request` and `stringprep`.
- **3.10.22 is the final 3.10 release** — 3.10 is now End-of-Life. 3.9 and older were already EOL.
- Exposure is through the interpreter: Docker base images, `.python-version`, CI `python-version`, local
  installs (Homebrew, uv, pyenv, conda) — and every tool that bundles its own Python.

Immediate action: find every Python runtime → move to a fixed version → rebuild images.

---

## Fixed Versions

| Line | Fixed in |
|------|----------|
| 3.14.x | `3.14.8` |
| 3.13.x | `3.13.16` (last full maintenance release; security-only afterwards) |
| 3.12.x | `3.12.15` |
| 3.11.x | `3.11.17` |
| 3.10.x | `3.10.22` (final — EOL) |
| 3.9.x and older | none (EOL) — upgrade |

---

## CVEs

| CVE | Module | Issue | Fixed in |
|-----|--------|-------|----------|
| CVE-2026-19445 | `ssl` | Use-after-free / crash when an SNI callback switches contexts (TLS servers using SNI callbacks) | all five |
| CVE-2026-19553 | `ssl`, `asyncio` | `wrap_bio()` / asyncio did not validate `server_hostname` | all five |
| CVE-2026-19672 | `tarfile` | Extraction filter lets paths leave and re-enter the destination, creating dirs outside it | all five |
| CVE-2026-82049 | `tarfile` | Filter bypass via hard links to symlinks — read/alter files outside the destination | 3.10–3.13 (3.14 already safe) |
| CVE-2026-87910 | `tarfile` | Filters not applied when a link falls back to extracting the archive member | 3.10–3.13 |
| CVE-2026-15310 | `zipfile` | Unbounded allocation decompressing bzip2 / LZMA (and Zstd on 3.14) members | all five |
| CVE-2026-15806 | `urllib.request` | `HTTPPasswordMgr` sends HTTPS credentials to HTTP URLs | all five |
| CVE-2026-17084 | `stringprep` / IDNA | Lookups not restricted to RFC 3454 codepoints | all five |

Also bundled: libexpat 2.8.5, OpenSSL 3.5.9 (3.13.16, 3.14.8), float/complex formatting crash fixes.

---

## Detection

Lockfile scans do NOT apply. Check every place the interpreter is chosen:

```bash
# Docker base images
grep -rnE '^FROM .*python' --include='Dockerfile*' .

# Version files / project metadata
cat .python-version 2>/dev/null; grep -n requires-python pyproject.toml

# CI
grep -rnE 'python-version' .github/workflows/

# Local machine
which -a python3; python3 -V
uv python list --only-installed
brew list --versions | grep -i python
```

A pin is affected if it is below the fixed version of its line, or 3.9 or older.
A floating tag (`python:3.12-slim`) is affected until the image is **rebuilt**. A tag whose OS variant is
EOL stops receiving Python builds at all — e.g. `python:3.11-slim-bullseye` froze at 3.11.13 in July 2025;
move to `-bookworm` / `-trixie` / plain `-slim`.

---

## Remediation

1. Pin or rebuild Docker images on a maintained OS variant (`python:3.12.15-slim`, `python:3.14.8-slim`).
2. Update `.python-version` / CI `python-version` where they name an exact patch.
3. Local: `brew upgrade python@3.x`, `uv python install 3.x.y && uv python uninstall <old>`,
   rebuild virtualenvs (a venv keeps a link to the interpreter it was created from).
4. Move 3.9 / 3.10 workloads to 3.12+.

Homebrew note (2026-10): the `python@3.14` 3.14.8 keg puts unversioned `python3` / `pip3` only in
`$(brew --prefix)/opt/python@3.14/libexec/bin`; add that to PATH, or `python3` silently falls through to
whatever older interpreter is next on PATH.

---

## Incident Response Template

```yaml
incident:
  advisory: ADV-2026-006
  project: '<name>'
  runtime_pins:
    - file: '<Dockerfile|.python-version|workflow>'
      current: '<version>'
      fixed: '<version>'
  eol_runtime: 'yes | no'
  rebuilt_and_deployed: 'yes | no'
  status: 'affected | patched | not_affected'
```
