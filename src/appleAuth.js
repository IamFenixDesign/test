import * as jose from 'jose'

const APPLE_JWKS = jose.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

export function appleClientId() {
  return String(process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICES_ID || '').trim()
}

export function appleRedirectUri() {
  return String(process.env.APPLE_REDIRECT_URI || '').trim()
}

export async function verifyAppleIdToken(credential, { email: clientEmail = '', firstName = '', lastName = '' } = {}) {
  const token = String(credential || '').trim()
  if (!token) {
    throw Object.assign(new Error('Falta el token de Apple'), { status: 400 })
  }

  const audience = appleClientId()
  if (!audience) {
    const error = new Error('Falta configurar APPLE_CLIENT_ID')
    error.code = 'NO_AUTH'
    error.status = 503
    throw error
  }

  try {
    const { payload } = await jose.jwtVerify(token, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience,
    })

    const sub = String(payload.sub || '').trim()
    if (!sub) {
      throw Object.assign(new Error('El token de Apple no es válido'), { status: 401 })
    }

    const tokenEmail = String(payload.email || '')
      .trim()
      .toLowerCase()
    const email = tokenEmail || String(clientEmail || '')
      .trim()
      .toLowerCase()

    if (payload.email_verified === false || payload.email_verified === 'false') {
      throw Object.assign(new Error('El correo de Apple no está verificado'), { status: 401 })
    }

    const given = String(firstName || '').trim()
    const family = String(lastName || '').trim()
    const name = [given, family].filter(Boolean).join(' ') || email || 'Cuenta Apple'

    return {
      provider: 'apple',
      providerId: sub,
      email,
      firstName: given,
      lastName: family,
      name,
      picture: '',
    }
  } catch (error) {
    if (error?.status) throw error
    throw Object.assign(new Error('No se pudo validar la sesión de Apple'), { status: 401 })
  }
}
