# Stockea — Android nativo

App **nativa** en Kotlin + Jetpack Compose (sin WebView / sin Capacitor).

Package: `app.stockea.android`

## Pantallas

- Login / registro / verificación
- Stock (alertas, +/- cantidad, **botón carrito** en el header, borrar)
- **Nuevo** (bottom sheet: nombre, unidad, stock, precio, EAN + **escanear con cámara**)
- Comparar precios (Coto / Carrefour / Día vía API, unidos por EAN o nombre equivalente)
- **Carrito** (sheet desde Stock, se cierra con ✕; sync por stock bajo)
- Perfil (editar, **tema claro/oscuro**, cerrar sesión)

Habla con el backend de Vercel: `https://test-iota-two-49.vercel.app`

## Requisitos

- JDK 21
- Android SDK 35

## Build

```bash
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

También está versionado en el repo:

[`android/release/stockea-debug.apk`](./release/stockea-debug.apk) · **v1.3.0** (`versionCode` 4)

Desde la raíz del repo:

```bash
npm run android:apk
```
