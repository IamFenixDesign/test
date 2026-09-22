# Stockea — Android nativo

App **nativa** en Kotlin + Jetpack Compose (sin WebView / sin Capacitor).

Package: `app.stockea.android`

## Pantallas

- Login / registro / verificación
- Stock (alertas, +/- cantidad, carrito automático por stock bajo, borrar)
- **Nuevo** (botón + en la barra inferior)
- Comparar precios (Coto / Carrefour / Día vía API, unidos por EAN)
- Carrito sincronizado con el stock bajo de la cuenta (igual que la web)
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

[`android/release/stockea-debug.apk`](./release/stockea-debug.apk)

Desde la raíz del repo:

```bash
npm run android:apk
```
