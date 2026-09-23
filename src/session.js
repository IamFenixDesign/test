import { jwtVerify, SignJWT } from 'jose'
import { clearCookie, getCookie, setCookie } from './http.js'
import { getUserById, upsertUser } from './db.js'

export const SESSION_COOKIE = 'stockly_session'

function secretKey() {
  const raw = process.env.AUTH_SECRET || ''
  if (!raw) {
    const error = new Error('AUTH_SECRET missing')
    error.code = 'NO_AUTH'
    throw error
  }
  return new TextEncoder().encode(raw)
}

export async function createSessionToken(user) {
  return new SignJWT({
    email: user.email || '',
    name: user.name || '',
    picture: user.picture || '',
    provider: user.provider || '',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey())
}

export async function readSession(req) {
  const token = getCookie(req, SESSION_COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey())
    const user = await getUserById(payload.sub)
    return user
  } catch {
    return null
  }
}

export async function requireUser(req, res) {
  const user = await readSession(req)
  if (!user) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Tenés que iniciar sesión' }))
    return null
  }
  return user
}

export async function startSession(res, user) {
  const token = await createSessionToken(user)
  setCookie(res, SESSION_COOKIE, token)
  return user
}

export async function establishSession(res, profile) {
  const result = await upsertUser(profile)
  const user = result?.user || result
  return startSession(res, user)
}

export function destroySession(res) {
  clearCookie(res, SESSION_COOKIE)
}
