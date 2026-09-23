# Stockea

Control de stock con precios de Coto Digital, Carrefour y Día.

## Auth (Google)

El login es **solo con Google** (web + Android).

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) creá un **OAuth client ID** tipo **Web**.
2. Authorized JavaScript origins:
   - `https://tu-app.vercel.app`
   - `http://localhost:5173`
3. En Vercel (y `.env` local) seteá:
   ```text
   GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
   ```
4. Para Android, el mismo Web Client ID alcanza (`setServerClientId`). Opcional en `android/local.properties`:
   ```text
   GOOGLE_WEB_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
   ```
5. En Google Cloud, agregá también un cliente **Android** con el package `app.stockea.android` y el SHA-1 de tu keystore (debug/release).

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

Descarga directa (repo): [`android/release/stockea-debug.apk`](android/release/stockea-debug.apk) · v1.3.0

Detalles: [`android/README.md`](android/README.md).

## GitHub Pages

https://iamfenixdesign.github.io/test/

En GitHub: **Settings → Pages → Source: GitHub Actions**.
Ahí no hay servidor: la búsqueda de supermercados usa un fallback en el navegador.
