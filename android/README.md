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

[`android/release/stockea-1.4.2.apk`](./release/stockea-1.4.2.apk) · **v1.4.2** (`versionCode` 16). Build **debug**, firmado con el certificado de depuración (el mismo de la 1.3.9). Si instalaste la 1.4.0 o la 1.4.1, desinstalá esa app: esas versiones usan otra firma.

## Login con Google

El botón usa Credential Manager con el client ID web. Play Services solo lo abre si en Google Cloud hay un cliente **Android** con el paquete `app.stockea.android` y el SHA-1 del APK instalado.

Este APK debug usa:

- SHA-1: `df8e92cce158808c87ccfe72b42dfccd455a4601`
- SHA-256: `68cbca442af6f3252ed85446894a567067417aa45c1dd538f8b4c321d616f33a`

Si el sheet se cierra al instante, la app pide registrar ese certificado. Un cierre después de ver las cuentas sigue siendo una cancelación.

Desde la raíz del repo:

```bash
npm run android:apk
```
