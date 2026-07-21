# Quick Start — Dari ZIP sampai Live

Panduan ini dibuat untuk repository GitHub Pages dan Cloudflare Free plan.

## 1. Persiapan

Siapkan:

- Akun GitHub.
- Akun Cloudflare.
- Akun Google Cloud.
- Node.js 20 atau lebih baru.
- File ZIP aplikasi yang sudah diekstrak.

Buka terminal/PowerShell pada folder hasil ekstrak.

## 2. Buat YouTube API key

1. Buka Google Cloud Console.
2. Buat project baru atau gunakan project yang tersedia.
3. Buka **APIs & Services → Library**.
4. Aktifkan **YouTube Data API v3**.
5. Buka **APIs & Services → Credentials**.
6. Pilih **Create credentials → API key**.
7. Pada API restrictions, batasi ke **YouTube Data API v3**.
8. Simpan API key untuk langkah 7.

## 3. Install Worker

```bash
cd worker
npm install
npx wrangler login
```

Browser Cloudflare akan terbuka. Klik authorize.

## 4. Buat D1 database

```bash
npx wrangler d1 create boga-food-trend-radar
```

Salin nilai `database_id` dari hasil perintah.

Buka `worker/wrangler.jsonc`, lalu ganti:

```json
"database_id": "PASTE_YOUR_D1_DATABASE_ID_HERE"
```

menjadi ID aktual.

## 5. Atur alamat GitHub Pages

Pada `worker/wrangler.jsonc`, ganti:

```json
"ALLOWED_ORIGINS": "https://YOUR_GITHUB_USERNAME.github.io,http://localhost:8080,http://127.0.0.1:8080"
```

Contoh untuk akun `operationalbi-pixel`:

```json
"ALLOWED_ORIGINS": "https://operationalbi-pixel.github.io,http://localhost:8080,http://127.0.0.1:8080"
```

Origin hanya memakai domain; jangan tambahkan `/nama-repository/`.

## 6. Buat tabel D1

Pastikan terminal masih berada di folder `worker`:

```bash
npx wrangler d1 migrations apply DB --remote
```

Jawab `y` bila diminta konfirmasi.

## 7. Simpan secret

YouTube API key:

```bash
npx wrangler secret put YOUTUBE_API_KEY
```

Paste key lalu Enter.

Buat admin token acak. Contoh membuat token menggunakan Python:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Simpan token tersebut, kemudian:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Paste token lalu Enter.

## 8. Deploy Worker

```bash
npx wrangler deploy
```

Catat URL yang muncul, contoh:

```text
https://boga-food-trend-radar-api.username.workers.dev
```

Tes di browser:

```text
https://boga-food-trend-radar-api.username.workers.dev/api/health
```

Hasil normal memiliki `"ok": true`.

## 9. Hubungkan dashboard

Kembali ke folder utama. Buka `site/config.js` dan ganti:

```javascript
apiBaseUrl: "https://PASTE-YOUR-WORKER.workers.dev"
```

menjadi URL Worker aktual.

## 10. Tes dashboard lokal

Dari folder utama:

```bash
python -m http.server 8080 --directory site
```

Buka:

```text
http://localhost:8080
```

Pastikan status dashboard menunjukkan `Live`.

## 11. Jalankan collection pertama

Pada dashboard:

1. Klik **Collector**.
2. Isi `ADMIN_TOKEN`.
3. Klik **Collect All**.
4. Tunggu sampai selesai.
5. Klik Refresh.

Google Trends dapat menghasilkan sedikit atau nol food topic pada jam tertentu. YouTube watchlist tetap menjadi discovery source utama.

## 12. Upload ke GitHub

Upload **seluruh isi folder utama**, bukan ZIP dan bukan folder pembungkus, ke root repository.

Root repository harus terlihat seperti:

```text
site/
worker/
.github/
README.md
QUICK_START.md
```

## 13. Aktifkan GitHub Pages

1. Buka repository GitHub.
2. Masuk ke **Settings → Pages**.
3. Pada **Build and deployment → Source**, pilih **GitHub Actions**.
4. Buka tab **Actions**.
5. Tunggu workflow **Deploy dashboard to GitHub Pages** menjadi hijau.

URL biasanya:

```text
https://USERNAME.github.io/NAMA-REPOSITORY/
```

## 14. Masukkan TikTok dan Instagram

1. Buka tab **Social Inbox**.
2. Isi Admin Token.
3. Pilih TikTok atau Instagram.
4. Isi trend name dan metrik aktual.
5. Masukkan URL evidence.
6. Klik **Save verified signal**.

Untuk banyak data, download CSV template lalu gunakan Bulk CSV Import.

## 15. Pastikan otomatis berjalan

Cron Worker telah diatur setiap jam:

- Google Trends: setiap jam.
- YouTube: hanya pada jam UTC yang habis dibagi 3.

Dashboard melakukan refresh setiap 5 menit ketika terbuka.
