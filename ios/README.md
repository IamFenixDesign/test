# Stockea — iOS nativo

App nativa en SwiftUI, el mismo alcance que Android: login con Google, stock, alta con escáner, comparar Coto / Carrefour / Día, carrito y perfil.

Bundle ID: `app.stockea.ios`

Habla con el backend de Vercel: `https://test-iota-two-49.vercel.app`

## Instalar desde Windows

Hace falta un iPhone con iOS 17 o más nuevo y un Apple ID (el gratuito alcanza).

1. Descargá `ios/release/Stockea-1.24.0.ipa`. En Perfil tiene que decir Versión 1.24.0. Borrá la instalación anterior antes de instalar: si el número de versión no sube, iOS deja la app vieja.
2. Instalá [Sideloadly](https://sideloadly.io) y conectá el iPhone por USB. Aceptá “Confiar” en el teléfono.
3. Abrí Sideloadly, arrastrá el IPA y poné tu Apple ID. Sideloadly lo firma y lo instala.
4. En el iPhone: Ajustes → General → VPN y gestión de dispositivos → confiar en el certificado.

Con un Apple ID gratuito la app caduca a los 7 días; volvé a instalar el mismo IPA para renovarla. El login de Google sigue pidiendo el Client ID de iOS en `Info.plist` antes de compilar.

## Qué necesitás para compilar en una Mac

- Mac con Xcode 16 o más nuevo
- Un iPhone (o el simulador) con iOS 17+
- Un cliente OAuth **iOS** en Google Cloud. El login de Google no arranca sin ese ID.

## Google Sign-In

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) creá un cliente **iOS**.
2. Bundle ID: `app.stockea.ios`
3. Copiá el Client ID, por ejemplo `123456789-abc.apps.googleusercontent.com`.
4. En `ios/Stockea/Info.plist` reemplazá las dos apariciones de `REEMPLAZAR`:
   - `GOOGLE_IOS_CLIENT_ID` → el Client ID completo
   - `CFBundleURLSchemes` → el Client ID dado vuelta, sin `.apps.googleusercontent.com`

   Si el Client ID es `123456789-abc.apps.googleusercontent.com`, el scheme es `com.googleusercontent.apps.123456789-abc`.

El ID token se valida con el cliente web que ya usa el servidor (`GOOGLE_CLIENT_ID`).

## Abrir y correr

```bash
open ios/Stockea.xcodeproj
```

En Xcode: elegí tu Team en Signing, un iPhone y Run.

La primera vez Xcode descarga el paquete `GoogleSignIn-iOS`.

## Pantallas

- Login solo con Google (sin cambio de tema)
- Stock: alertas, +/−, editar, carrito, borrar
- Nuevo y editar: nombre, categoría, unidad, stock, precio de súper o personalizado, EAN y cámara
- Comparar precios (Coto, Carrefour y Día)
- Carrito con descuentos semanales de sucursal
- Barra: Comparar, Stock, Perfil. El nuevo ítem está junto al carrito. El tema sigue el ajuste del iPhone.
- Perfil: exportar e importar JSON, cerrar sesión
