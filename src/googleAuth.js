import * as jose from 'jose'

const GOOGLE_JWKS = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

function googleAudiences() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

export function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || '').trim()
}

export async function verifyGoogleIdToken(credential) {
  const token = String(credential || '').trim()
  if (!token) {
    throw Object.assign(new Error('Falta el token de Google'), { status: 400 })
  }

  const audiences = googleAudiences()
  if (!audiences.length) {
    const error = new Error('Falta configurar GOOGLE_CLIENT_ID')
    error.code = 'NO_AUTH'
    error.status = 503
    throw error
  }

  try {
    const { payload } = await jose.jwtVerify(token, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: audiences.length === 1 ? audiences[0] : audiences,
    })

    const email = String(payload.email || '')
      .trim()
      .toLowerCase()
    const sub = String(payload.sub || '').trim()
    if (!sub || !email) {
      throw Object.assign(new Error('El token de Google no es válido'), { status: 401 })
    }
    if (payload.email_verified === false) {
      throw Object.assign(new Error('El correo de Google no está verificado'), { status: 401 })
    }

    const given = String(payload.given_name || '').trim()
    const family = String(payload.family_name || '').trim()
    const fullName = String(payload.name || '').trim()
    const parts = fullName.split(/\s+/).filter(Boolean)

    return {
      provider: 'google',
      providerId: sub,
      email,
      firstName: given || parts[0] || '',
      lastName: family || parts.slice(1).join(' ') || '',
      name: fullName || email,
      picture: String(payload.picture || '').trim(),
    }
  } catch (error) {
    if (error?.status) throw error
    throw Object.assign(new Error('No se pudo validar la sesión de Google'), { status: 401 })
  }
}
