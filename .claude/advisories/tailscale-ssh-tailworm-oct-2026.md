# ADV-2026-008: Tailscale SSH "Tailworm" privilege escalation (port forwarding)

**Severity:** HIGH (root on other tailnet nodes from one compromised node; wormable in a lab)
**Date:** 2026-10-26 (public report), recorded 2026-10-30
**Type:** Infrastructure / agent vulnerability (NOT a supply chain attack, lockfile scans do not detect it)
**Status:** Active
**Source:** https://thehackernews.com/2026/10/unpatched-tailscale-ssh-flaws-could-let.html
(research: Erica Windisch, Cyberdione Labs; 11 Tailscale + headscale issues)

## Executive Summary

- A device already permitted to SSH into another node via **Tailscale SSH** can escalate to **root** on that
  node when **SSH port forwarding** is allowed, then move laterally to every node the tailnet ACL lets it reach.
- Preconditions: the target runs the Tailscale SSH server (`tailscale up --ssh` / `RunSSH: true`) **and** an
  ACL `ssh` rule permits the attacker's node. A node that does not run Tailscale SSH is not a target.
- `check` mode on the SSH rule does NOT fix it.
- Patch status (as of 2026-10-30): one write-up says **1.104.4 (2026-10-28)** fixes it by dropping forwarding
  privileges to the logged-in user. Not yet confirmed from a Tailscale bulletin; verify at
  https://tailscale.com/security-bulletins before relying on it. headscale status unknown.

---

## Detection

```bash
tailscale version                                  # < 1.104.4 = treat as affected until confirmed
tailscale debug prefs | grep -E '"RunSSH"'         # true = this node is a Tailscale SSH server (target)
tailscale status                                   # which nodes share the tailnet (lateral reach)
```

In the admin console / policy file: list every `ssh` rule (`"ssh": [...]`) and which nodes run `--ssh`.

---

## Remediation

1. Upgrade every node to the fixed release once confirmed (Mac app: Tailscale menu > Check for updates;
   Linux: package manager).
2. Until patched: turn off Tailscale SSH where it is not needed (`tailscale set --ssh=false`), and narrow
   ACL `ssh` rules to the minimum users/nodes. Avoid `autogroup:nonroot` / root targets.
3. On servers that need SSH, prefer regular OpenSSH with keys over Tailscale SSH until the fix is confirmed.

---

## Environment state

Record each host you check (node or host, version, result) in your own global copy
(`~/.claude/advisories/`), not here: this file is copied into every project.

---

## Incident Response Template

```yaml
incident:
  advisory: ADV-2026-008
  node: '<name>'
  tailscale_version: '<version>'
  run_ssh: 'true | false'
  acl_ssh_rules_reviewed: 'yes | no'
  status: 'affected | patched | not_affected'
```
