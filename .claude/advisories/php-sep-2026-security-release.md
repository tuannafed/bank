# ADV-2026-005: PHP September 2026 Security Release — Runtime Patch Guide

**Severity:** HIGH (highest CVSS 3.1 = 7.5)
**Date:** 2026-09-24
**Type:** Runtime vulnerability (NOT a supply chain attack — `composer.lock` scans do not detect it)
**Status:** Active
**Source:** https://www.php.net/archive/2026.php

> Verification note: written 2026-10-22 while php.net was unreachable (DNS failure). Versions and CVEs below
> come from secondary sources (rocket-boys.co.jp, securityonline.info), which disagree on the CVE count
> (10 vs 11). Re-check against the php.net archive and add any later release before relying on this list.

## Executive Summary

- PHP 8.2.34, 8.3.35, 8.4.26 and 8.5.11 fix roughly 10–11 CVEs across all supported lines.
- Worst issue: an unauthenticated request can crash an exposed `SoapServer` endpoint.
- No active exploitation or CISA KEV listing reported as of 2026-09-27.

Immediate action: find every PHP runtime pin → move to a fixed version → rebuild images / restart PHP-FPM.

---

## Fixed Versions

| Line | Fixed in |
|------|----------|
| 8.2.x | `8.2.34` |
| 8.3.x | `8.3.35` |
| 8.4.x | `8.4.26` |
| 8.5.x | `8.5.11` |
| 8.1.x and older | none (EOL) — upgrade |

---

## Notable CVEs

| CVE | Component | Issue |
|-----|-----------|-------|
| CVE-2026-91765 | ext/soap `SoapServer` | Unauthenticated crash (DoS), CVSS 7.5 |
| CVE-2026-91766 | HTTP stream wrapper | Redirects can forward credentials to a different host |
| CVE-2026-91768 | PHP-FPM | `listen.allowed_clients` ACL bypass over IPv6 |

The remaining CVEs in the release are listed on php.net / the PHP GitHub security advisories.

---

## Detection

```bash
# Docker base images (official wordpress:/php: images included)
grep -rnE '^FROM (php|wordpress)|image: *(php|wordpress)' --include='Dockerfile*' --include='*compose*.y*ml' .

# CI
grep -rnE 'php-version' .github/workflows/

# Running host / container
php -v
```

A floating tag (`wordpress:latest`, `php:8.3-fpm`) is affected until the image is pulled and rebuilt.
Customer-hosted PHP (e.g. a WordPress plugin installed on a client's host) is the client's runtime — notify,
do not assume it is patched.

---

## Remediation

1. Pin images to a fixed version (`php:8.3.35-fpm`) or `docker compose pull` + rebuild floating tags.
2. Restart PHP-FPM after a package-manager upgrade on bare hosts.
3. If `SoapServer` is exposed and patching is delayed, block the endpoint at the proxy.
4. If PHP-FPM listens on IPv6 with `listen.allowed_clients`, bind to a Unix socket or IPv4 until patched.

---

## Incident Response Template

```yaml
incident:
  advisory: ADV-2026-005
  project: '<name>'
  runtime_pins:
    - file: '<Dockerfile|compose|workflow>'
      current: '<version>'
      fixed: '<version>'
  soap_server_exposed: 'yes | no'
  status: 'affected | patched | not_affected'
```
