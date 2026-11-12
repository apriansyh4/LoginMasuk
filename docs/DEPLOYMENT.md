# Deployment notes

## Supabase free tier (verified 2026-11-12)
Sources: [supabase.com/pricing](https://supabase.com/pricing), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

| Limit | Free plan | Impact on AR-LOKAL |
|---|---|---|
| Database | 500 MB per project | metadata only; fine for an MVP |
| File storage | 1 GB total | ≈ a few hundred submissions (image ≤10 MB + GLB ≤40 MB + USDZ). Retention cleanup (M4) matters |
| Max file upload | 50 MB | bucket caps: `uploads` 10 MB, `models` 40 MB, both below 50 MB |
| Egress | 5 GB + 5 GB cached | GLB views count; keep models small (face cap in M2) |
| Active projects | 2; projects **pause after 1 week of inactivity** | a demo must be woken before presenting |
| Auth email (built-in SMTP) | **2 emails/hour per project**, team addresses only | configure custom SMTP for real users (default then 30/hour, adjustable) |
| Realtime | 200 concurrent connections, 2 M messages/month | job progress (M2) fits easily |
| MAU | 50,000 | n/a |

## Promote the first admin
Register and verify the account normally, then:
```bash
psql "$SUPABASE_DB_URL" -v email='owner@example.com' -f supabase/scripts/promote_admin.sql
```

## Checklist
- `supabase link` then `supabase db push` to apply migrations; **do not** run `seed.sql` in production.
- Set Auth → URL configuration: site URL = `NEXT_PUBLIC_APP_URL`, redirect allow-list `…/auth/callback`.
- Enable email confirmations; set up custom SMTP.
- Run the frontend behind exactly one trusted reverse proxy (IP rate limits trust the first `x-forwarded-for` hop).
- ai-service on a private network only (no public port), with `AILOKAL_SERVICE_SECRET` ≥ 24 random chars.
- HTTPS is required for AR (M3).
