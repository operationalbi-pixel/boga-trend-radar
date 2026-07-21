# TikTok & Instagram Social Signals

## Prinsip

TikTok dan Instagram pada edisi gratis menggunakan **Manual Verified Signal**. Angka berasal dari platform, tetapi dimasukkan oleh pengguna karena free public discovery API tidak menjadi fondasi sistem ini.

## Data minimum

- Platform.
- Trend name.
- Captured at.
- Views atau jumlah post.
- Evidence URL.

Data yang lebih baik:

- Likes.
- Comments.
- Shares.
- Unique creators.
- Published at.
- Notes atau hashtag terkait.

## Cara menghasilkan growth

Growth membutuhkan minimal dua snapshot dengan:

- nama trend sama,
- platform sama,
- selisih waktu minimal sekitar 6 jam.

Contoh:

```text
08:00 TikTok — Mochi Croissant — 120.000 views
20:00 TikTok — Mochi Croissant — 310.000 views
```

Sistem membandingkan metric value terbaru dengan snapshot sebelumnya.

## TikTok workflow gratis

1. Buka TikTok Creative Center.
2. Pilih Trends atau Hashtags.
3. Pilih region Indonesia dan periode yang relevan.
4. Cari tema food/dessert/pastry atau lihat hashtag yang sedang naik.
5. Input ke Social Inbox.
6. Ulangi terhadap kandidat terkuat.

## Instagram workflow gratis

1. Buka Reels/Explore.
2. Pantau akun food creator dan kompetitor.
3. Catat istilah produk yang berulang pada beberapa akun.
4. Masukkan link dan metrik ke Social Inbox.
5. Gunakan creator count apabila satu trend muncul pada beberapa akun.

## CSV columns

```text
source,trendName,category,region,views,likes,comments,shares,postCount,creatorCount,creator,publishedAt,collectedAt,url,note
```

`source` harus `TikTok` atau `Instagram`.
