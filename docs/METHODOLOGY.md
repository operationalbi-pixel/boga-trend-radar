# Methodology

## Viral Score

| Component | Maximum |
|---|---:|
| Growth | 25 |
| Views velocity | 15 |
| Total reach | 15 |
| Search volume | 10 |
| Engagement including shares | 15 |
| Creator diversity | 10 |
| Multi-source confirmation | 10 |

## Engagement

```text
(likes + comments × 2 + shares × 3) / views
```

Shares diberi bobot lebih tinggi karena lebih kuat menunjukkan distribusi konten.

## Growth

Sistem mencari snapshot sebelumnya dari source yang sama dengan rentang sekitar 6 jam sampai 7 hari.

```text
growth % = (current metric - previous metric) / previous metric × 100
```

Metric utama:

- YouTube: views per hour.
- Google Trends: approximate search traffic.
- TikTok/Instagram: total views untuk growth; views per hour tetap dipakai sebagai velocity bila waktu publikasi tersedia.

## Cross-source confirmation

Trend yang muncul di lebih dari satu source mendapat confidence dan source score lebih tinggi.

## Lifecycle

- Early Signal: pertumbuhan sangat cepat, tetapi score/volume belum besar.
- Emerging: momentum dan score mulai kuat.
- Growing: score tinggi dan terus berkembang.
- Viral: score dan volume sangat tinggi.
- Saturated: volume besar tetapi pertumbuhan melambat.
- Declining: metrik turun dibanding snapshot sebelumnya.
- Monitor: data belum cukup atau sinyal masih lemah.

## Data labels

- `api`: otomatis dari API/RSS.
- `manual_verified`: angka aktual yang dimasukkan dari TikTok/Instagram oleh pengguna.
