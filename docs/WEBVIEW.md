# WebView Implementation

## URL

Gunakan URL GitHub Pages, contoh:

```text
https://USERNAME.github.io/boga-trend-radar/
```

Jangan gunakan URL file mentah `raw.githubusercontent.com` karena content type, relative asset, service worker, dan navigasinya tidak sesuai untuk aplikasi web.

## Android WebView — Kotlin

Konfigurasi penting:

```kotlin
webView.settings.javaScriptEnabled = true
webView.settings.domStorageEnabled = true
webView.settings.databaseEnabled = true
webView.settings.allowFileAccess = false
webView.settings.allowContentAccess = false
webView.settings.setSupportZoom(false)
webView.webViewClient = WebViewClient()
webView.webChromeClient = WebChromeClient()
webView.loadUrl("https://USERNAME.github.io/boga-trend-radar/")
```

Internet permission:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Back navigation:

```kotlin
onBackPressedDispatcher.addCallback(this) {
    if (webView.canGoBack()) webView.goBack() else finish()
}
```

File upload untuk CSV/JSON membutuhkan implementasi `WebChromeClient.onShowFileChooser`. Tanpa handler tersebut, tombol import file dapat tidak membuka picker pada beberapa Android WebView.

## iOS WKWebView — Swift

```swift
let config = WKWebViewConfiguration()
config.websiteDataStore = .default()
let webView = WKWebView(frame: .zero, configuration: config)
let url = URL(string: "https://USERNAME.github.io/boga-trend-radar/")!
webView.load(URLRequest(url: url))
```

WKWebView memerlukan persistent website data agar localStorage tersimpan.

## Cache dan update

Aplikasi memakai service worker. Saat mengganti file dan pengguna masih melihat versi lama:

1. Naikkan `CACHE_NAME` di `service-worker.js`.
2. Commit dan deploy ulang.
3. Tutup dan buka ulang WebView.
4. Bila perlu, clear website data/cache pada aplikasi native.

## Security

- Batasi WebView hanya membuka domain GitHub Pages dan domain Apps Script yang diperlukan.
- Buka evidence URL eksternal melalui external browser, bukan selalu di dalam WebView.
- Jangan aktifkan arbitrary file access.
- Jangan menyimpan Google API secret di JavaScript atau aplikasi APK/IPA.
