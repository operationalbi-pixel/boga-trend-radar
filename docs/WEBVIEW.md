# WebView Notes

Gunakan URL GitHub Pages sebagai URL WebView.

## Android

Aktifkan:

- JavaScript.
- DOM storage.
- Network access HTTPS.
- Back navigation menggunakan `webView.canGoBack()`.
- File chooser bila fitur Bulk CSV Import akan dipakai di aplikasi.

Contoh konfigurasi dasar:

```kotlin
webView.settings.javaScriptEnabled = true
webView.settings.domStorageEnabled = true
webView.loadUrl("https://USERNAME.github.io/NAMA-REPOSITORY/")
```

Untuk upload CSV, implementasikan `WebChromeClient.onShowFileChooser`.

## iOS

Gunakan `WKWebView` dan load URL GitHub Pages. Seluruh koneksi Worker menggunakan HTTPS sehingga biasanya tidak membutuhkan App Transport Security exception.

## Session

Database tersimpan di Cloudflare D1. Admin token hanya berada pada `sessionStorage` WebView dan hilang ketika session ditutup/dibersihkan.

## Recommended behavior

- Tampilkan loading screen sampai `didFinish`/`onPageFinished`.
- Sediakan pull-to-refresh.
- Buka evidence TikTok, Instagram, YouTube, atau news di external browser bila aplikasinya tersedia.
- Izinkan download CSV template dan upload file CSV.
