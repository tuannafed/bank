# ADV-2026-010: Claude Code editor extension 2.1.313 trojanized (persistent SSH backdoor)

**Severity:** CRITICAL (remote shell on the developer machine; up to ~5,000 installs reported)
**Date:** 2026-10-29 (malicious build live ~02:27 to 13:35 PT = 2026-10-29 16:27 to 2026-10-30 03:35 ICT)
**Type:** Supply chain attack on an editor extension (lockfile scans do NOT detect it)
**Status:** Active
**Source:** https://cursor.com/blog/claude-code-extension-security-notice ,
https://thehackernews.com/2026/10/official-claude-code-vs-code-extension.html

## Executive Summary

- `anthropic.claude-code` **2.1.313** was published with a malicious loader. It adds an attacker SSH key,
  enables the local SSH service (macOS Remote Login / Linux sshd / Windows OpenSSH Server), opens a reverse
  tunnel and beacons host data.
- Distribution: reported through **Open VSX** and mirrored into the **Cursor** marketplace (so Cursor, VSCodium,
  Windsurf and other Open VSX editors). Researchers do not believe it reached the main VS Code Marketplace or
  Anthropic's own release channels; sources disagree, so check every editor.
- Replaced by **2.1.314**. Uninstalling or updating the extension does NOT remove the persistence.

---

## Indicators of Compromise (IOC)

- Extension version: `anthropic.claude-code-2.1.313-*` (folder in `~/.cursor/extensions`, `~/.vscode-oss/extensions`,
  `~/.windsurf/extensions`, `~/.vscode/extensions`)
- `extension.js` SHA-256 (single source): `ecb58cb29078d9646ad1dcdbe51526f2d9cfea06be5fb2ab183e8ecc3ab6bf15`
- Strings in `extension.js`: `134.209.82.225`, `svc-telemetry`
- SSH key comment `svc-telemetry` in `~/.ssh/authorized_keys`
- C2 / tunnel: `134.209.82.225` (SSH 22, beacon 8099); local beacon `127.0.0.1:8099/beacon`
- Persistence (reported): macOS LaunchAgent `com.apple.sysmond.plist`; Windows scheduled task `SysMon`;
  cron `@reboot` entries; dropped SSH key files

---

## Detection (macOS / Linux)

```bash
# 1. Was 2.1.313 ever installed? (folder, obsolete list, editor logs)
ls -d ~/.cursor/extensions/anthropic.claude-code-* ~/.vscode/extensions/anthropic.claude-code-* \
      ~/.vscode-oss/extensions/anthropic.claude-code-* ~/.windsurf/extensions/anthropic.claude-code-* 2>/dev/null
cat ~/.cursor/extensions/.obsolete 2>/dev/null | tr ',' '\n' | grep claude-code
grep -rhn 'anthropic.claude-code 2.1.31' ~/Library/Application\ Support/Cursor/logs 2>/dev/null | grep -i download

# 2. IOC strings in any installed copy
grep -rl --include=extension.js -e 134.209.82.225 -e svc-telemetry ~/.cursor ~/.vscode ~/.vscode-oss ~/.windsurf 2>/dev/null

# 3. Backdoor
grep -c svc-telemetry ~/.ssh/authorized_keys          # must be 0
ls ~/Library/LaunchAgents /Library/LaunchAgents /Library/LaunchDaemons | grep -iE 'sysmond|sysmon'
crontab -l | grep -i reboot
nc -z 127.0.0.1 22 && echo "Remote Login ON"          # lsof as a user misses the launchd-owned socket
lsof -nP -i @134.209.82.225; lsof -nP -iTCP:8099
```

---

## Remediation (if any IOC matches)

1. Disconnect the machine from the network.
2. Remove the `svc-telemetry` line from `authorized_keys`, delete the LaunchAgent / cron / task, turn off
   Remote Login (System Settings > General > Sharing).
3. Update the extension to 2.1.314 or later (or remove it).
4. From a **clean** machine rotate every credential the affected machine held: SSH keys, GitHub / npm tokens,
   cloud CLIs (Fly, Cloudflare, Supabase, AWS), `.env` secrets, browser sessions.
5. Prefer re-imaging if the tunnel was active.

## Prevention

- Turn off extension auto-update in Open VSX based editors, or delay updates for a few days.
- Keep Remote Login off on developer machines.

---

## Environment state

Record each machine you check in your own global copy (`~/.claude/advisories/`), not here:
this file is copied into every project.

---

## Incident Response Template

```yaml
incident:
  advisory: ADV-2026-010
  machine: '<name>'
  editors_checked: ['cursor', 'vscode', 'vscodium', 'windsurf']
  version_313_installed: 'yes | no'
  authorized_keys_svc_telemetry: 'yes | no'
  persistence_found: 'yes | no'
  credentials_rotated: 'yes | no | n/a'
  status: 'compromised | clean'
```
