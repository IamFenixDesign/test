import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64)
  return `${salt.toString('hex')}:${Buffer.from(derived).toString('hex')}`
}

export async function verifyPassword(password, stored) {
  if (!password || !stored || !stored.includes(':')) return false
  const [saltHex, hashHex] = stored.split(':')
  const expected = Buffer.from(hashHex, 'hex')
  const derived = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), 64))
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

export function createEmailCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashEmailCode(code, email) {
  const secret = process.env.AUTH_SECRET || ''
  return createHash('sha256').update(`${secret}:${String(email).trim().toLowerCase()}:${code}`).digest('hex')
}

export function verifyEmailCode(code, email, storedHash) {
  if (!code || !storedHash) return false
  const next = Buffer.from(hashEmailCode(code, email))
  const expected = Buffer.from(storedHash)
  if (next.length !== expected.length) return false
  return timingSafeEqual(next, expected)
}
