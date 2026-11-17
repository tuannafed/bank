# ADV-2026-004: Node.js October 2026 Security Release — Runtime Patch Guide

**Severity:** HIGH (4 High, 3 Medium, 3 Low)
**Date:** 2026-10-21
**Type:** Runtime vulnerability (NOT a supply chain attack — lockfile scans do not detect it)
**Status:** Active
**Source:** https://nodejs.org/en/blog/vulnerability/october-2026-security-releases

## Executive Summary

- Every supported Node.js line (22.x, 24.x, 26.x) ships 10 CVEs; the worst is an out-of-bounds write in the
  Brotli decoder that permits **remote code execution**.
- End-of-Life lines (**18.x, 20.x** and older) are always affected and will never receive a fix.
- Exposure is through the runtime itself: Docker base images, `.nvmrc`, CI `node-version`, and local machines.

Immediate action: find every Node runtime pin → move to a fixed version → rebuild and redeploy images.

---

## Fixed Versions

| Line | Fixed in |
|------|----------|
| 22.x | `v22.23.4` |
| 24.x | `v24.22.1` |
| 26.x | `v26.12.1` |
| 18.x / 20.x | none (EOL) — upgrade to 22.x or 24.x |

---

## CVEs

| CVE | Severity | Lines | Component | Issue |
|-----|----------|-------|-----------|-------|
| CVE-2026-111497 | High | 26, 24, 22 | zlib Brotli decoder | Out-of-bounds write permitting RCE |
| CVE-2026-105483 | High | 26, 24 | TLS hostname verification | Bypass when the IP is written with fullwidth digits |
| CVE-2026-106069 | High | 26, 24, 22 | TLS hostname verification | Bypass when the host loosely resolves to an IP address |
| CVE-2026-105482 | High | 26, 24, 22 | `dns.resolve` | Names containing a NUL character are truncated |
| CVE-2026-105481 | Medium | 26, 24, 22 | HTTP keep-alive | Socket processes a response written before the request was sent |
| CVE-2026-106072 | Medium | 26, 24, 22 | TLS certificate validation | Non-canonical IPv4 hostnames let DNS SANs authenticate IP endpoints |
| CVE-2026-106074 | Medium | 26, 24, 22 | `crypto.randomUUID()` / `randomInt()` | Entropy cache saved into startup snapshots / SEAs, so every process repeats values |
| CVE-2026-106070 | Low | 26 | ZipFile | Returns attacker-controlled prefix bytes after failed header validation |
| CVE-2026-106071 | Low | 26 | Permission Model | Filesystem over-grant via wildcard radix lookup |
| CVE-2026-106073 | Low | 26, 24, 22 | Permission Model | Bypass through `fs.realpathSync` |

Bundled dependency updates: c-ares, CA certs (eMudhra intermediate CA compromise), OpenSSL (24, 22),
SQLite (22), undici (26, 24, 22).

---

## Detection

Lockfile scans do NOT apply. Check every place the Node runtime version is chosen:

```bash
# Docker base images
grep -rn '^FROM node' --include='Dockerfile*' .

# Version files
cat .nvmrc .node-version .tool-versions 2>/dev/null

# CI
grep -rn 'node-version' .github/workflows/

# package.json engines (informational only — does not pin the runtime)
grep -n '"node"' package.json

# Local machine and running containers
node -v
```

A pin is affected if it is below the fixed version of its line, or is any 18.x / 20.x.
A floating tag (`node:24-slim`, `node:22-alpine`) is affected until the image is **rebuilt** after the
fixed tag is published — the running container keeps the version it was built with.

---

## Risks

- RCE via any code path that decompresses Brotli from an untrusted source — including `fetch()` / undici
  responses carrying `Content-Encoding: br` and request bodies decompressed by middleware.
- TLS hostname bypass lets a MITM present a certificate for the wrong host on outbound HTTPS calls.
- Repeated `randomUUID()` values in snapshot / SEA builds (ID collisions, predictable tokens).

---

## Remediation

1. Pin Docker base images to an exact fixed version, e.g. `FROM node:24.22.1-slim`, `FROM node:22.23.4-alpine`.
2. Update `.nvmrc` / CI `node-version` (a floating `24.x` resolves to the latest on the next CI run — re-run it).
3. Rebuild and redeploy every server image; a merged Dockerfile change without a deploy fixes nothing.
4. Move any 18.x / 20.x service to 22.x or 24.x (major upgrade — test before deploy).
5. Upgrade local machines: `nvm install 24.22.1` (or the matching line).

Frontend-only projects that use Node solely at build time carry lower risk; patch on the next build.

---

## Incident Response Template

```yaml
incident:
  advisory: ADV-2026-004
  project: '<name>'
  runtime_pins:
    - file: '<Dockerfile|.nvmrc|workflow>'
      current: '<version>'
      fixed: '<version>'
  eol_runtime: 'yes | no'
  rebuilt_and_deployed: 'yes | no'
  status: 'affected | patched | not_affected'
```
