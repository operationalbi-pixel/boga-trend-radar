# Implementation Plan — BOGA Trend Radar

## Fase 1: Pilot statis

**Tujuan:** memastikan workflow bisnis dan scoring dipakai oleh Boga Lab, Marketing, Operations, dan Cost Control.

- Host aplikasi di GitHub Pages.
- Gunakan local mode pada 1–3 perangkat.
- Masukkan 50–100 keyword awal.
- Input TikTok/Instagram/competitor evidence secara manual.
- Import Google Trends mingguan.
- Jalankan product test pada 1–3 outlet.
- Export backup JSON setiap minggu.

**Kriteria lulus:** tim dapat menghasilkan minimal 5 opportunity review dan 2 product test tanpa spreadsheet terpisah.

## Fase 2: Shared cloud data

- Deploy Apps Script backend.
- Buat Google Sheets database.
- Aktifkan auto-sync.
- Aktifkan YouTube Data API collector.
- Buat jadwal collector harian.
- Definisikan satu owner untuk keyword taxonomy dan satu owner commercial-fit scoring.

**Kriteria lulus:** seluruh pengguna melihat data yang sama, tidak ada duplicate trend, dan collector stabil.

## Fase 3: BigQuery validation

- Buat mapping experiment ID ↔ product test code.
- Bentuk scheduled query agregasi harian.
- Aktifkan BigQuery sync.
- Ukur quantity, net sales, transaction, repeat customers, outlet penetration, dan test duration.

**Kriteria lulus:** setiap product test memiliki hasil penjualan tanpa input manual.

## Fase 4: Production backend

Pindahkan dari Apps Script ketika salah satu kondisi berikut tercapai:

- Observation melebihi puluhan ribu record.
- Dibutuhkan authentication per-user.
- Dibutuhkan approval workflow formal.
- Dibutuhkan audit log immutable.
- Dibutuhkan integrasi banyak brand.

Arsitektur target:

```text
GitHub Pages / WebView frontend
        ↓
Cloud Run API + Identity-Aware Proxy
        ↓
PostgreSQL / Firestore
        ↓
BigQuery + scheduled jobs
```

## Governance

### Boga Lab

- Production feasibility.
- Ingredient availability.
- Product format dan shelf life.

### Operations

- Production ease.
- Outlet test selection.
- SOP dan service execution.

### Marketing

- Trend evidence.
- Visual appeal.
- Creator/platform signals.

### Cost Control / Finance

- Margin potential.
- Target COGS.
- Test economics.

### Commercial Owner

- Keputusan Fast Test, Adapt, Monitor, atau Stop.
- Menjaga SLA dari trend detection sampai outlet test.

## SLA rekomendasi

| Action | Maksimum waktu keputusan |
|---|---:|
| Fast Test | 3 hari |
| Differentiate Fast | 5 hari |
| Adapt Concept | 7 hari |
| Lab Test | 10 hari |
| Monitor | Review mingguan |

## KPI tools

- Detection-to-decision lead time.
- Decision-to-test lead time.
- Persentase Fast Test yang diluncurkan.
- Test hit rate.
- Revenue dari trend-led products.
- Repeat purchase produk hasil test.
- Predicted viral score vs actual sales.
