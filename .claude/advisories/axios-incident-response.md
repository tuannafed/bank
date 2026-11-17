# ADV-2026-001: Axios npm Hijack — Incident Response Guide

**Severity:** CRITICAL
**Date:** 2026-03-31
**Attack window:** 00:21–03:15 UTC, 2026-03-31
**Status:** Active

## Executive Summary

- The axios maintainer's npm account was compromised.
- Malicious versions:
  - `axios@1.14.1`
  - `axios@0.30.4`
- Hidden dependency injected as a RAT:
  - `plain-crypto-js@4.2.1`

Immediate action: scan lockfiles → isolate affected machines → rotate secrets.

---

## Indicators of Compromise (IOC)

### Packages

- `axios@1.14.1`
- `axios@0.30.4`
- `plain-crypto-js@4.2.1`

### Network

- Domain: `sfrclak.com`
- IPs: `142.11.206.73`, `23.254.167.216`

### Filesystem

- macOS: `/Library/Caches/com.apple.act.mond`
- Linux: `/tmp/ld.py`
- Windows:
  - `%PROGRAMDATA%\wt.exe`
  - `%TEMP%\6202033.vbs`
- Node:
  - `node_modules/plain-crypto-js/setup.js`

---

## Detection

### Lockfile check

Search lockfiles for:
- `axios@1.14.1`
- `axios@0.30.4`
- `plain-crypto-js@4.2.1`

### Node modules

```bash
find node_modules -name plain-crypto-js -type d
```

### Network logs

Check for connections to `sfrclak.com` or the IPs listed above.

---

## Risks

- Credential theft (`.env`, tokens, SSH keys)
- Lateral movement across infrastructure
- Source code leakage
- Supply chain compromise of downstream consumers
- Legal exposure

---

## Remediation

### Not infected

```bash
npm install axios@1.14.0 --ignore-scripts
rm -rf node_modules/plain-crypto-js
```

`package.json`:

```json
{
  "overrides": {
    "axios": "1.14.0"
  }
}
```

### Infected

- Isolate the machine.
- Re-image the system.
- Rotate ALL credentials.
- Audit logs.
- Notify legal if required by policy.

---

## Safe Versions

Use any axios version NOT listed above. Latest known safe at time of writing: `1.8.4` (verify on npmjs.com).

---

## Prevention

### Short-term

```bash
npm ci --ignore-scripts
npm audit --audit-level=high
```

`.npmrc`:
```
min-release-age=3
```

### Mid-term

- OIDC / SLSA provenance
- SBOM
- Short-lived tokens
- Consider pnpm for stricter resolution

---

## CISO Summary

- Severity: HIGH/CRITICAL
- Type: Supply chain attack
- Action: Scan → isolate → rotate → prevent

---

## Incident Response Template

```yaml
incident_response_plan:
  detection_status: 'affected | not_affected | investigating'
  affected_assets:
    - machine_1
  iocs_found:
    - axios@1.14.1
  remediation_steps_taken:
    - downgrade_axios
    - block_c2
  recommended_actions:
    - rotate_credentials
    - reimage_machines
  ciso_summary: 'High severity supply chain attack'
  prevention_controls:
    - oidc_provenance
    - ignore_scripts
```
