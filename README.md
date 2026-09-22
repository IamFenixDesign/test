# Stockea

Control de stock con precios de Coto Digital, Carrefour y Día.

## Vercel (recomendado)

Importá el repo en [Vercel](https://vercel.com/new). El endpoint `/api/supers` consulta Coto, Carrefour y Día desde el servidor, igual que `npm run dev`.

Sitio de ejemplo: conectá `IamFenixDesign/test`.

## App Android (nativa)

Proyecto **Kotlin + Jetpack Compose** en `/android` (sin WebView).

```bash
cd android
./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Detalles: [`android/README.md`](android/README.md).

## GitHub Pages

https://iamfenixdesign.github.io/test/

En GitHub: **Settings → Pages → Source: GitHub Actions**.
Ahí no hay servidor: la búsqueda de supermercados usa un fallback en el navegador.
