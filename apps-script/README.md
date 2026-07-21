# Google Apps Script Backend

Backend opsional ini membuat data GitHub Pages dapat dipakai bersama melalui Google Sheets dan menyimpan YouTube API key di server-side Script Properties.

## 1. Buat Apps Script project

1. Buka Google Apps Script.
2. Buat **New project**.
3. Ganti isi `Code.gs` dengan file `Code.gs` di folder ini.
4. Buka **Project Settings** dan aktifkan **Show appsscript.json manifest file**.
5. Ganti manifest dengan isi `appsscript.json`.

## 2. Jalankan setup

Dari editor, pilih fungsi:

```text
setupProject
```

Klik **Run**, berikan permission, lalu lihat Execution Log. Sistem akan membuat spreadsheet `BOGA Trend Radar Database` dan menyimpan ID-nya sebagai Script Property `DATA_SHEET_ID`.

## 3. Tambahkan Script Properties

Pada **Project Settings → Script Properties**, tambahkan:

```text
API_TOKEN = token-random-internal
YOUTUBE_API_KEY = your-youtube-data-api-key
BIGQUERY_PROJECT_ID = your-gcp-project-id
BIGQUERY_LOCATION = asia-southeast2
BIGQUERY_SQL = SELECT ...
```

`BIGQUERY_*` bersifat opsional.

## 4. Deploy sebagai Web App

1. Klik **Deploy → New deployment**.
2. Pilih **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone** atau opsi akses yang tersedia dan sesuai kebutuhan.
5. Deploy.
6. Copy URL yang berakhir `/exec`.

Masukkan URL tersebut ke root `config.js`:

```js
storageMode: "apps-script",
apiUrl: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec",
apiToken: "token-random-internal"
```

## 5. Inisialisasi data cloud

Saat cloud masih kosong:

1. Buka dashboard.
2. Data seed akan muncul dari local mode.
3. Klik **Settings → Sync Now** tidak otomatis mengunggah bila cloud kosong pada load pertama.
4. Lakukan satu perubahan kecil, misalnya menambah keyword; auto-save akan mengirim state ke Sheets.

Alternatif: sementara set `autoSync: true`, buka dashboard, lalu buat satu trend baru.

## 6. YouTube collector

Pastikan YouTube Data API v3 aktif pada Google Cloud project yang memiliki API key tersebut. Collector:

- Membaca keyword aktif.
- Mencari video terbaru.
- Mengambil view, like, comment, video count, dan creator count.
- Membuat/memperbarui observation YouTube pada tanggal berjalan.
- Membuat trend baru bila keyword belum terhubung ke trend.

Untuk jadwal harian, jalankan satu kali:

```text
createDailyYouTubeTrigger
```

Trigger akan menjalankan `scheduledYouTubeCollect` sekitar pukul 06.00 zona Asia/Jakarta.

## 7. BigQuery sync opsional

Aktifkan BigQuery API dan Apps Script Advanced Service BigQuery. Query harus menghasilkan kolom:

```text
experiment_id
sales_date
outlet
product_code
quantity
net_sales
transactions
repeat_customers
```

Contoh query tersedia di `examples/bigquery_sales_query.sql`.

Aksi API yang disediakan:

```text
loadState
saveState
collectYouTube
syncBigQuery
```

## Batasan

Google Sheets backend ini cocok untuk MVP dan tim kecil. Saat volume observation menjadi sangat besar atau membutuhkan role-based security yang ketat, pindahkan backend ke Cloud Run/Firebase/Supabase dan database production.
