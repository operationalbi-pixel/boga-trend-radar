# Setup Checklist

Centang satu per satu.

## Google

- [ ] Google Cloud project dibuat.
- [ ] YouTube Data API v3 aktif.
- [ ] API key dibuat.
- [ ] API key dibatasi hanya untuk YouTube Data API v3.

## Cloudflare

- [ ] Node.js terpasang.
- [ ] `npm install` selesai.
- [ ] `npx wrangler login` berhasil.
- [ ] D1 database dibuat.
- [ ] `database_id` sudah dimasukkan ke `worker/wrangler.jsonc`.
- [ ] `ALLOWED_ORIGINS` sudah memakai username GitHub yang benar.
- [ ] Migration berhasil.
- [ ] `YOUTUBE_API_KEY` tersimpan sebagai Wrangler secret.
- [ ] `ADMIN_TOKEN` tersimpan sebagai Wrangler secret.
- [ ] Worker berhasil deploy.
- [ ] `/api/health` mengembalikan `ok: true`.

## Dashboard

- [ ] URL Worker sudah dimasukkan ke `site/config.js`.
- [ ] Dashboard lokal terbuka.
- [ ] Collect All berhasil.
- [ ] Data source health tampil.
- [ ] Social Inbox dapat menyimpan TikTok/Instagram signal.

## GitHub

- [ ] Semua folder di-upload ke root repository.
- [ ] `site/.nojekyll` tersedia.
- [ ] Settings → Pages → Source = GitHub Actions.
- [ ] Workflow Pages hijau.
- [ ] URL GitHub Pages dapat dibuka.
- [ ] Status dashboard menunjukkan Live.

## Operasional

- [ ] Watchlist keyword telah ditambah sesuai kebutuhan.
- [ ] PIC TikTok/Instagram ditentukan.
- [ ] Input TikTok dilakukan 1–2 kali per hari.
- [ ] Nama trend ditulis konsisten agar snapshot tergabung.
- [ ] Evidence URL selalu dimasukkan.
