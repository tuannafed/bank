#!/usr/bin/env bash
# One-shot deploy to Cloudflare: D1 + secrets + migrations + build + Worker.
# Usage:
#   ./scripts/deploy.sh                                   # first deploy / redeploy
#   ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com ACCESS_AUD=<aud> ./scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/apps/api"
CFG="$API/wrangler.jsonc"
W="pnpm --dir $API exec wrangler"
PLACEHOLDER="00000000-0000-0000-0000-000000000000"

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$1"; }

step "Cài dependencies"
pnpm --dir "$ROOT" install --frozen-lockfile

step "Kiểm tra đăng nhập Cloudflare"
if ! $W whoami 2>/dev/null | grep -qi "associated with the email"; then
  $W login
fi

step "D1 database"
if grep -q "$PLACEHOLDER" "$CFG"; then
  ID=$($W d1 list --json 2>/dev/null | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const db=JSON.parse(s).find(d=>d.name==="bank");if(db)process.stdout.write(db.uuid)}catch{}})')
  if [ -z "$ID" ]; then
    ID=$($W d1 create bank 2>&1 | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  fi
  [ -n "$ID" ] || { echo "Không tạo/tìm được D1 'bank'"; exit 1; }
  perl -pi -e "s/$PLACEHOLDER/$ID/" "$CFG"
  echo "database_id = $ID (đã ghi vào wrangler.jsonc)"
else
  echo "Đã có database_id trong wrangler.jsonc"
fi

if [ -n "${ACCESS_TEAM_DOMAIN:-}" ] && [ -n "${ACCESS_AUD:-}" ]; then
  step "Ghi cấu hình Cloudflare Access"
  perl -pi -e "s#\"ACCESS_TEAM_DOMAIN\": \".*\"#\"ACCESS_TEAM_DOMAIN\": \"${ACCESS_TEAM_DOMAIN%/}\"#; s#\"ACCESS_AUD\": \".*\"#\"ACCESS_AUD\": \"$ACCESS_AUD\"#" "$CFG"
fi

step "Migrate D1 (remote)"
CI=1 $W d1 migrations apply bank --remote

step "Build PWA"
pnpm --dir "$ROOT" --filter web build

step "Deploy Worker"
$W deploy

step "DeepSeek API key"
if $W secret list 2>/dev/null | grep -q DEEPSEEK_API_KEY; then
  echo "Đã có secret DEEPSEEK_API_KEY"
else
  read -r -s -p "Dán DEEPSEEK_API_KEY rồi Enter: " KEY; echo
  printf '%s' "$KEY" | $W secret put DEEPSEEK_API_KEY
fi

if grep -q '"ACCESS_TEAM_DOMAIN": ""' "$CFG"; then
  cat <<'MSG'

⚠  App đang khoá (API trả 500 "Access is not configured") cho tới khi bật Cloudflare Access:
   1. Dashboard → Workers & Pages → bank → Settings → Domains & Routes → workers.dev → bật Cloudflare Access
      (hoặc Zero Trust → Access → Applications → Add self-hosted cho domain của bạn, policy Allow email của bạn).
   2. Lấy "Application Audience (AUD) Tag" và team domain https://<team>.cloudflareaccess.com
   3. Chạy lại:  ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com ACCESS_AUD=<aud> ./scripts/deploy.sh
MSG
else
  printf '\n\033[1;32m✓ Xong.\033[0m Mở URL workers.dev ở trên trên Safari iPhone → Share → Add to Home Screen.\n'
fi
