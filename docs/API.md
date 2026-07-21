# API Reference

Base URL:

```text
https://YOUR-WORKER.workers.dev
```

## Public endpoints

### Health

```http
GET /api/health
```

### Dashboard stats

```http
GET /api/stats
```

### List trends

```http
GET /api/trends?limit=100&sort=score&source=tiktok
```

Parameters: `limit`, `offset`, `category`, `lifecycle`, `source`, `q`, `sort`, `active`.

### Trend detail

```http
GET /api/trends/:id-or-slug
```

### Source health

```http
GET /api/sources
```

### Recent social signals

```http
GET /api/social-signals?limit=100&source=tiktok
```

### Watchlist

```http
GET /api/watchlist
```

## Admin authorization

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
```

### Run collectors

```http
POST /api/admin/collect
Content-Type: application/json

{"source":"all"}
```

Source: `all`, `google_trends`, atau `youtube`.

### Add one TikTok/Instagram signal

```http
POST /api/admin/signals
Content-Type: application/json

{
  "source": "tiktok",
  "trendName": "Strawberry Pistachio Cup",
  "category": "Dessert",
  "region": "ID",
  "views": 1850000,
  "likes": 126000,
  "comments": 4800,
  "shares": 19500,
  "postCount": 42,
  "creatorCount": 31,
  "creator": "@foodcreator",
  "publishedAt": "2026-07-21T02:00:00.000Z",
  "collectedAt": "2026-07-21T05:00:00.000Z",
  "url": "https://www.tiktok.com/...",
  "note": "Creative Center verified"
}
```

### Bulk social signals

```http
POST /api/admin/signals/bulk
Content-Type: application/json

{"items":[{...},{...}]}
```

Maksimal 200 signal per request.

### Add watchlist

```http
POST /api/admin/watchlist
Content-Type: application/json

{"query":"mochi croissant","category":"Pastry"}
```
