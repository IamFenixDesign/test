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

[`android/release/stockea-1.4.1.apk`](./release/stockea-1.4.1.apk) · **v1.4.1** (`versionCode` 15). Firmado en release, sin el certificado de depuración que bloquea Play Protect. Si venías de un APK de depuración, desinstalá esa versión: la firma cambió. Desde 1.4.0 se actualiza encima.

## Login con Google

El botón usa Credential Manager con el client ID web. Play Services solo lo abre si en Google Cloud hay un cliente **Android** con:

- Paquete: `app.stockea.android`
- SHA-1 del certificado release: `becfd2fb3d84f5194908439dd7c81f1e49ae9565`
- SHA-256: `3837b0ba0e91b24d875797bde2b5d30f42a8bcc9a3c70add445f951934e76b3d`

Sin ese SHA-1, el sheet se cierra al instante. La app ya no lo muestra como «Inicio de sesión cancelado»: pide registrar el certificado. Un cierre después de ver las cuentas sigue siendo una cancelación.

Desde la raíz del repo:

```bash
npm run android:apk
```
