# BOGA Food Trend Radar — Free Hybrid Edition

Aplikasi untuk menangkap **food trend aktual dan near real-time** dengan biaya awal gratis:

- Google Trends RSS: otomatis setiap jam.
- YouTube Data API: otomatis setiap 3 jam.
- TikTok Creative Center: input manual terverifikasi.
- Instagram Reels/Explore: input manual terverifikasi.
- Cloudflare Worker: API, scheduler, collector, dan scoring.
- Cloudflare D1: histori snapshot untuk menghitung growth.
- GitHub Pages: dashboard/WebView.

Aplikasi ini **tidak menggunakan data contoh**. Dashboard akan kosong sampai collector pertama atau social signal pertama berhasil masuk.

## Flow

```text
Google Trends RSS ── otomatis ─┐
YouTube Data API ─── otomatis ─┤
TikTok Creative Center ─ manual ├─> Cloudflare Worker ─> D1 History
Instagram Reels ─────── manual ┘          │
                                           ├─> Momentum & Viral Score
                                           └─> GitHub Pages Dashboard
```

## Fitur

- Automatic food-topic discovery dari YouTube.
- Google Trending Now food filtering.
- Watchlist keyword untuk YouTube.
- TikTok dan Instagram Social Inbox.
- Single input dan bulk CSV import.
- Label data: `LIVE API / RSS` atau `MANUAL VERIFIED`.
- Views, likes, comments, shares, creator count, post count, views/hour.
- Viral Score, Momentum, Growth, Saturation, Confidence.
- Lifecycle: Early Signal, Emerging, Growing, Viral, Saturated, Declining, Monitor.
- Evidence URL dan score history.
- Mobile responsive, PWA, dan WebView ready.

## Struktur file

```text
.
├── site/                         # dashboard GitHub Pages
│   ├── index.html
│   ├── config.js
│   ├── service-worker.js
│   ├── manifest.webmanifest
│   ├── .nojekyll
│   ├── assets/
│   └── templates/social-signals-template.csv
├── worker/                       # Cloudflare API + D1 + scheduler
│   ├── src/
│   ├── migrations/
│   ├── test/
│   ├── wrangler.jsonc
│   └── package.json
├── .github/workflows/
│   ├── pages.yml
│   └── worker.yml
├── QUICK_START.md
├── SETUP_CHECKLIST.md
└── docs/
```

## Implementasi tercepat

Ikuti [QUICK_START.md](QUICK_START.md). Untuk checklist satu per satu, buka [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md).

Ringkasan:

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create boga-food-trend-radar
```

Masukkan `database_id` ke `worker/wrangler.jsonc`, kemudian:

```bash
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

Salin URL Worker ke `site/config.js`, upload seluruh repository ke GitHub, lalu pilih **Settings → Pages → Source: GitHub Actions**.

## Data TikTok gratis

1. Buka TikTok Creative Center.
2. Masuk ke Trends/Hashtags dan pilih region Indonesia.
3. Pilih trend yang relevan dengan makanan.
4. Masukkan trend name, views, posts, creators, engagement, dan link evidence ke tab **Social Inbox**.
5. Ulangi snapshot terhadap trend yang sama setelah beberapa jam atau hari agar growth dapat dihitung.

## Data Instagram gratis

1. Temukan food trend dari Reels, Explore, creator, atau kompetitor.
2. Salin URL post/Reels dan metrik yang tersedia.
3. Masukkan melalui Social Inbox.
4. Ulangi dengan nama trend yang sama untuk membuat histori pertumbuhan.

## Kenapa TikTok/Instagram manual?

Versi gratis menghindari scraping dan tidak mengklaim akses API discovery yang tidak tersedia. Data tetap aktual karena angka dimasukkan dari sumber platform dan diberi label **Manual Verified**.

## Update frequency

| Source | Mode | Frequency |
|---|---|---|
| Google Trends | Automatic | Setiap jam |
| YouTube | Automatic | Setiap 3 jam |
| TikTok | Manual verified | Disarankan 1–2 kali sehari |
| Instagram | Manual verified | Saat ditemukan signal baru |
| Dashboard | Automatic refresh | Setiap 5 menit |

## Keamanan

- Jangan menaruh `YOUTUBE_API_KEY` atau `ADMIN_TOKEN` dalam GitHub.
- Secret disimpan memakai `wrangler secret put`.
- `site/config.js` hanya berisi URL publik Worker.
- Admin token disimpan sementara di `sessionStorage` browser, bukan permanen.
- Gunakan token acak minimal 32 karakter.

## Pengujian

```bash
node scripts/validate.mjs
cd worker
npm test
```

## Dokumentasi lanjutan

- [Metodologi scoring](docs/METHODOLOGY.md)
- [API Reference](docs/API.md)
- [TikTok & Instagram workflow](docs/SOCIAL_SIGNALS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [WebView](docs/WEBVIEW.md)
