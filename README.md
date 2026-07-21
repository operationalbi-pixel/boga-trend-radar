# BOGA Trend Radar — GitHub Pages / WebView Edition

Static food-trend intelligence dashboard yang bisa langsung di-host di GitHub Pages dan dibuka melalui Android/iOS WebView.

## Yang sudah tersedia

- Viral Potential Score 0–100.
- Bakerzin Commercial Fit Score 0–100.
- Saturation Score dan 7-day growth.
- Keputusan otomatis: Fast Test, Differentiate Fast, Adapt Concept, Lab Test, Monitor, Ignore.
- CRUD trend dan observation/evidence.
- Product Test Board dan status workflow.
- Sales validation per outlet.
- Opportunity map.
- Filter category, action, dan search.
- Import Google Trends CSV.
- Export/import backup JSON.
- Export ranking trend ke CSV.
- Keyword watchlist.
- Responsive mobile WebView.
- PWA/offline cache.
- Local mode tanpa backend.
- Optional shared mode melalui Google Apps Script + Google Sheets.
- Optional YouTube collector dengan API key tersimpan di Apps Script.
- Optional BigQuery sales sync melalui Apps Script.

## Struktur repository

```text
.
├── index.html
├── 404.html
├── config.js
├── manifest.webmanifest
├── service-worker.js
├── .nojekyll
├── assets/
│   ├── app.js
│   ├── styles.css
│   └── icon.svg
├── data/
│   ├── seed.json
│   └── google_trends_sample.csv
├── apps-script/
│   ├── Code.gs
│   ├── appsscript.json
│   └── README.md
├── docs/
│   ├── IMPLEMENTATION.md
│   └── WEBVIEW.md
├── examples/
│   └── bigquery_sales_query.sql
└── .github/workflows/pages.yml
```

## Deploy paling cepat ke GitHub Pages

1. Buat repository baru, misalnya `boga-trend-radar`.
2. Upload seluruh isi folder ini ke root repository.
3. Pastikan default branch bernama `main`.
4. Buka **Settings → Pages**.
5. Pada **Build and deployment → Source**, pilih **GitHub Actions**.
6. Push/commit ke branch `main`.
7. Workflow `Deploy static site to GitHub Pages` akan mempublikasikan situs.

URL umumnya:

```text
https://USERNAME.github.io/boga-trend-radar/
```

Semua link asset menggunakan relative path, sehingga aplikasi tetap berjalan di project path GitHub Pages.

## Mode 1 — Local, langsung berfungsi

Konfigurasi bawaan di `config.js`:

```js
window.BOGA_CONFIG = {
  storageMode: "local",
  apiUrl: "",
  apiToken: ""
};
```

Data disimpan di `localStorage` perangkat/browser. Mode ini cocok untuk:

- Demo.
- Pilot satu perangkat.
- WebView pribadi.
- Pengujian UI dan scoring.

Gunakan menu **Settings & Backup** untuk memindahkan data antarperangkat.

## Mode 2 — Shared data dengan Apps Script

Ikuti `apps-script/README.md`, lalu ubah `config.js`:

```js
window.BOGA_CONFIG = {
  storageMode: "apps-script",
  apiUrl: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec",
  apiToken: "TOKEN_INTERNAL_YANG_SAMA",
  autoSync: true
};
```

Mode ini menyimpan data bersama di Google Sheets dan memungkinkan YouTube collector tanpa membuka API key di GitHub.

## Menjalankan lokal

Karena aplikasi memakai service worker dan fetch seed JSON, jalankan melalui HTTP server, bukan klik langsung `index.html`.

Python:

```bash
python -m http.server 8080
```

Lalu buka:

```text
http://localhost:8080
```

## Google Trends CSV

Format wajib:

```csv
keyword,search_interest,date
Pistachio Strawberry Cup,92,2026-07-21
Pistachio Strawberry Cup,71,2026-07-14
```

Contoh ada di `data/google_trends_sample.csv`.

## Keamanan

- Jangan memasukkan YouTube API key, service-account JSON, BigQuery credential, atau password ke repository.
- GitHub Pages adalah static hosting; seluruh file repository publik dapat dilihat pengguna.
- Simpan secret di Google Apps Script Script Properties.
- Gunakan repository private bila akun/organisasi mendukung kebutuhan Pages private yang sesuai.
- `API_TOKEN` di browser bukan autentikasi tingkat tinggi karena nilainya ada di `config.js`. Token ini hanya menjadi pembatas ringan. Untuk data sensitif, gunakan backend dengan login/identity provider.

## WebView

Panduan Android/iOS, konfigurasi JavaScript, DOM storage, file chooser, dan back navigation tersedia di `docs/WEBVIEW.md`.
