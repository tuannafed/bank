# ADV-2026-007: Java SE October 2026 Critical Patch Update — Runtime Patch Guide

**Severity:** HIGH (55 Java SE fixes, 49 remotely exploitable without auth; max Java SE CVSS 7.5 per Fortra)
**Date:** 2026-10-20 (plus CVE-2026-91403 security alert, 2026-10-21)
**Type:** Runtime vulnerability (NOT a supply chain attack — lockfile scans do not detect it)
**Status:** Active
**Source:** https://www.oracle.com/security-alerts/cpuoct2026.html

## Executive Summary

- Oracle's October 2026 CPU ships 55 Java SE security fixes across every supported line.
- Oracle builds received a same-day point release with a `.0.2` suffix (e.g. `21.0.13.0.2`) — check the exact build.
- CVE-2026-91403 (2026-10-21): Java's response to the eMudhra weak-key CA incident (same incident as the
  Node.js October release's CA-cert update).
- OpenJDK distributions (Temurin, Zulu, Corretto, Microsoft, Homebrew `openjdk`) publish their own builds on
  their own schedule — a distro can lag days behind Oracle.

Immediate action: find every JDK/JRE → move to a fixed build → rebuild images.

---

## Fixed Versions

| Line | Fixed in |
|------|----------|
| 27 | `27.0.1` |
| 25 (LTS) | `25.0.5` |
| 21 (LTS) | `21.0.13` (Oracle: `21.0.13.0.2`) |
| 17 (LTS) | `17.0.21` (Oracle: `17.0.21.0.2`) |
| 11 (LTS) | `11.0.33` |
| 8 (LTS) | `8u511` |
| non-LTS lines out of support (e.g. 22, 23, 24, 26) | none — upgrade |

---

## Detection

Lockfile scans do NOT apply. Check every place the JDK is chosen:

```bash
# Docker base images (eclipse-temurin, maven:*-eclipse-temurin-*, tomcat:*-jdk*-temurin, amazoncorretto, azul/zulu...)
grep -rnE '^FROM .*(temurin|openjdk|corretto|zulu|jdk|jre|maven|gradle|tomcat)' --include='Dockerfile*' .

# CI
grep -rnE 'java-version|setup-java|distribution:' .github/workflows/

# Version files / build config
cat .java-version .sdkmanrc .tool-versions 2>/dev/null
grep -nE 'maven.compiler.(release|source|target)|<release>|languageVersion|toolchain' pom.xml build.gradle* 2>/dev/null

# Local machine
/usr/libexec/java_home -V; java -version
brew list --versions openjdk; brew list --cask --versions | grep -iE 'temurin|zulu|corretto'
```

A floating Docker tag (`eclipse-temurin:17-jre`, `maven:3.9-eclipse-temurin-17`, `tomcat:9.0-jdk17-temurin`) is
affected until the upstream image is rebuilt with the fixed JDK **and** you rebuild yours. Verify the exact patched
tag exists on Docker Hub (e.g. `eclipse-temurin:17.0.21_*`) before pinning; if it does not exist yet, record
"waiting for upstream image" rather than guessing a tag.

---

## Remediation

1. Docker: pin an exact patched tag once published; rebuild and redeploy.
2. CI: `actions/setup-java` with an exact `java-version` (e.g. `17.0.21`) or a floating major that resolves to it.
3. Local: `brew upgrade openjdk`; for LTS JDK casks prefer one that already ships the fix
   (2026-10-23: `temurin@17` = 17.0.21 while `zulu@17` was still 17.0.20.1).
4. Move off unsupported non-LTS lines to 21 or 25.

---

## Incident Response Template

```yaml
incident:
  advisory: ADV-2026-007
  project: '<name>'
  runtime_pins:
    - file: '<Dockerfile|workflow|pom.xml>'
      current: '<version>'
      fixed: '<version>'
  upstream_image_available: 'yes | no'
  rebuilt_and_deployed: 'yes | no'
  status: 'affected | patched | waiting_upstream | not_affected'
```
