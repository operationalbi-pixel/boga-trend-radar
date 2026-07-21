# Troubleshooting

## Dashboard menampilkan Setup required

Periksa `site/config.js`. `apiBaseUrl` harus URL Worker aktual tanpa slash terakhir.

## `/api/health` error

Jalankan kembali:

```bash
cd worker
npx wrangler deploy
```

Periksa log:

```bash
npx wrangler tail
```

## Error D1 table not found

```bash
cd worker
npx wrangler d1 migrations apply DB --remote
```

Pastikan `database_id` benar.

## YouTube collector error: API key missing

```bash
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler deploy
```

## Unauthorized saat Collect atau Social Inbox

Admin token yang dimasukkan harus sama dengan secret:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

## CORS error

Pada `worker/wrangler.jsonc`, `ALLOWED_ORIGINS` harus memuat:

```text
https://USERNAME.github.io
```

Setelah mengubah config:

```bash
npx wrangler deploy
```

## Google Trends tidak menghasilkan food trend

Ini dapat terjadi apabila daftar Trending Now saat itu didominasi topik non-food. Sistem sengaja menyaring topik non-food. Jalankan YouTube collector dan tambah watchlist food keyword.

## Growth masih 0

Growth memerlukan minimal dua snapshot source yang sama dengan jeda minimal sekitar 6 jam. Ulangi input TikTok/Instagram menggunakan trend name yang sama.

## GitHub Pages workflow merah karena `.nojekyll`

Pastikan file berikut ada:

```text
site/.nojekyll
```

Workflow sudah diarahkan untuk upload folder `site`.

## Perubahan UI tidak terlihat

Service worker mungkin masih memakai cache lama:

- Tekan Ctrl+F5.
- Hapus site data/cache browser.
- Tutup dan buka kembali WebView.
