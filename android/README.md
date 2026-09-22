# Stockea — Android

App nativa Android (Capacitor) de Stockea: stock, comparar precios (Coto / Carrefour / Día), carrito, perfil, escáner y auth.

## Qué incluye

- Package ID: `app.stockea.android`
- Carga la app web publicada en Vercel (`https://test-iota-two-49.vercel.app`)
- Permisos de cámara (escáner de códigos) e internet
- Icono y splash de Stockea

## Requisitos

- Node.js 20+
- JDK 21
- Android SDK (API 35) / Android Studio Ladybug+

## Comandos

```bash
# Instalar deps
npm install

# Sync web → Android
npm run android:sync

# Abrir en Android Studio
npm run android:open

# APK debug
npm run android:apk
```

El APK queda en:

`android/app/build/outputs/apk/debug/app-debug.apk`

## Cambiar la URL del servidor

En `capacitor.config.json`:

```json
"server": {
  "url": "https://test-iota-two-49.vercel.app"
}
```

Para empaquetar solo el `dist` local (sin URL remota), borrá la clave `server.url`, corré `npm run android:sync` y asegurate de que la API apunte a tu backend.

## Firma release

En Android Studio: **Build → Generate Signed Bundle / APK**.
