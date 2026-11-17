# Bank: kế hoạch trả nợ và quỹ khẩn cấp

PWA dùng cho một người: trả nợ theo Avalanche, gom quỹ khẩn cấp, nhập giao dịch bằng câu tự nhiên qua DeepSeek. Chạy hoàn toàn trên Cloudflare, gói free.

```
apps/web        Vite + React + Tailwind v4 + vite-plugin-pwa (dashboard, AI quick log)
apps/api        Cloudflare Worker (Hono): /api/* + phục vụ build của web
  migrations/   D1 schema, trigger, seed
packages/core   TypeScript thuần: tiền tệ, phí rollover, lịch Avalanche, roadmap, parser LLM
```

```
iPhone (PWA) ──▶ Cloudflare Access (OTP email) ──▶ Worker
                                                    ├─ /api/*  → D1 (SQLite)
                                                    │           └─ /api/parse → DeepSeek
                                                    └─ /*      → static assets (PWA)
```

## Người dùng & không gian
- **User** = email được admin mời (Quản lý → Người dùng). Đăng nhập bằng Cloudflare Access (mã OTP qua email); Worker kiểm tra email có trong bảng `users`, chưa mời → 403.
- **Admin** đầu tiên lấy từ `ADMIN_EMAILS` trong `wrangler.jsonc`; lần đăng nhập đầu sẽ nhận dữ liệu cũ (`ws-legacy`).
- **Không gian (workspace)**: mỗi user có 1 không gian *cá nhân*; có thể tạo *nhóm dùng chung* (vd Gia đình) và thêm user khác vào. Mọi nợ, giao dịch, ngân sách, quỹ, cài đặt thuộc 1 không gian. Tỷ giá dùng chung.
- PWA gửi header `X-Workspace-Id`; API kiểm tra membership trên mọi request và lọc mọi truy vấn theo `workspace_id`.
- Local: `DEV_BYPASS_AUTH=true` + header `X-Dev-Email` để giả lập user khác.

## Quy ước dữ liệu
- Tiền lưu dạng số nguyên ở đơn vị nhỏ nhất: VND ×1, USD/USDT ×100 (cent). Không dùng float.
- `transactions.amount_vnd` là generated column, công thức trùng với `toVnd()` trong core.
- Ledger chỉ ghi thêm (append-only). Sửa sai thì xoá rồi nhập lại. Trigger tự cập nhật `debts.balance_minor`, `goals.current_vnd` và `fx_rates`.
- Trả vượt dư nợ thì CHECK `balance_minor >= 0` chặn lại, cả batch bị rollback.
- Khi mọi khoản nợ về 0: trigger đánh dấu xong Giai đoạn 1 và bắt đầu Giai đoạn 2. Nếu sau đó có phí mới hoặc xoá một khoản trả, Giai đoạn 1 mở lại.
- Thứ tự trả nợ: khoản có `priority_order` (khác null) trả trước, tiếp theo là phí %/tháng cao nhất, cuối cùng là dư nợ nhỏ hơn.

## Chạy local
```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # điền DEEPSEEK_API_KEY
pnpm db:migrate:local
pnpm dev:api          # wrangler :8787
pnpm dev:web          # vite :5173, proxy /api sang :8787
pnpm test             # test cho core
```

Sau khi pull code mới có migration (vd `0003_settings.sql`), chạy lại `pnpm db:migrate:local` (và `db:migrate:remote` khi deploy).

UI dùng shadcn/ui (`apps/web/components.json`, style new-york, Tailwind v4) + `motion` cho animation. Thêm component: `cd apps/web && npx shadcn@latest add <tên>`.

## Deploy lên Cloudflare
```bash
pnpm deploy:cf        # đăng nhập, tạo D1, migrate, build, deploy, hỏi DEEPSEEK_API_KEY
```
Sau lần đầu, bật Access để mở khoá app (API trả 500 cho tới khi có):
1. Dashboard → Workers & Pages → **bank** → Settings → Domains & Routes → workers.dev → **Enable Cloudflare Access**.
2. Popup hiện AUD tag và team domain. Chạy lại:
   `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com ACCESS_AUD=<aud> pnpm deploy:cf`
3. Zero Trust → Access → Policies: cho phép các email sẽ dùng app (hoặc **Everyone**, vì app tự chặn email chưa được mời).
4. Mở URL `bank.<subdomain>.workers.dev` trên Safari iPhone → Share → **Add to Home Screen**.

Dữ liệu seed (dư nợ VPBank/HSBC, ngày sao kê) là số giả định: sửa lại trong tab **Quản lý** sau khi deploy.

## API
| Method | Path | Mục đích |
|---|---|---|
| GET | `/api/dashboard` | Phase, tiến độ, các khoản nợ, phí, kế hoạch trả |
| GET | `/api/schedule?budget=` | Lịch Avalanche đầy đủ theo tháng |
| POST | `/api/parse` `{text}` | Câu tự nhiên → bản nháp giao dịch (**chưa lưu**) |
| POST | `/api/transactions` `{transactions:[...]}` | Lưu atomic (tối đa 10) |
| GET / DELETE | `/api/transactions[/:id]` | Lịch sử / hoàn tác |
| GET / POST | `/api/debts` `{debts:[...]}` | Danh sách / thêm khoản nợ (dời mốc Phase 1 theo) |
| PATCH | `/api/debts/:id` | Sửa phí, ngày, ưu tiên, alias; đối soát dư nợ |
| POST | `/api/debts/:id/archive` | Đóng khoản đã trả hết |
| DELETE | `/api/debts/:id` | Xoá khoản tạo nhầm (chỉ khi chưa có giao dịch) |
| PATCH | `/api/budgets/:id` | Đặt hạn mức tháng cho mục ngân sách |
| GET / PUT | `/api/settings` | Ngân sách trả nợ/tháng (lưu trong DB) |
| PUT | `/api/fx/:currency` `{rateVnd}` | Đặt tỷ giá USD/USDT |

`/api/parse` nhận `{ text?, imageDataUrl? }`. Ảnh bill được PWA thu về ~1600px JPEG rồi gửi thẳng cho `deepseek-flash` (đọc ảnh native). Kết quả chỉ là bản nháp: `drafts` (giao dịch) + `newDebts` (khoản nợ mới), người dùng xác nhận mới lưu.
