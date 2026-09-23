import { destroySession, readSession, requireUser, startSession } from '../src/session.js'
import { readJson, send } from '../src/http.js'
import {
  getUserRowByEmail,
  getUserRowById,
  getUserRowByProvider,
  markEmailVerified,
  registerEmailUser,
  rowToUser,
  saveEmailCode,
  updatePassword,
  updateProfile,
  upsertUser,
  listItems,
  transferItemsToUser,
  deleteUserAccount,
  attachGoogleProvider,
} from '../src/db.js'
import { createEmailCode, hashEmailCode, hashPassword, verifyEmailCode, verifyPassword } from '../src/passwords.js'
import { sendCodeEmail, sendVerificationEmail } from '../src/mail.js'
import { googleClientId, verifyGoogleIdToken } from '../src/googleAuth.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_TTL_MS = 15 * 60 * 1000

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    picture: user.picture,
    provider: user.provider,
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function expiresAt() {
  return new Date(Date.now() + CODE_TTL_MS).toISOString()
}

function pendingMailResult(email, code, delivery) {
  const result = { pending: true, email }
  // Resend sandbox (onboarding@resend.dev) can't deliver to other inboxes —
  // return the code so register/verify still works with any email.
  if (delivery && !delivery.delivered) {
    result.code = code
    result.mailMode = 'sandbox'
  }
  return result
}

async function issueEmailCode(user, purpose = 'verify') {
  const code = createEmailCode()
  await saveEmailCode(user.id, hashEmailCode(code, user.email), expiresAt())
  const delivery = await sendCodeEmail({ to: user.email, firstName: user.firstName, code, purpose })
  return pendingMailResult(user.email, code, delivery)
}

async function handleRegister(body) {
  const firstName = String(body.firstName || body.nombre || '').trim()
  const lastName = String(body.lastName || body.apellido || '').trim()
  const email = normalizeEmail(body.email || body.correo)
  const password = String(body.password || body.contrasena || '')

  if (!firstName) throw Object.assign(new Error('Falta el nombre'), { status: 400 })
  if (!lastName) throw Object.assign(new Error('Falta el apellido'), { status: 400 })
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('El correo no es válido'), { status: 400 })
  if (password.length < 8) throw Object.assign(new Error('La contraseña debe tener al menos 8 caracteres'), { status: 400 })

  const code = createEmailCode()
  const user = await registerEmailUser({
    email,
    passwordHash: await hashPassword(password),
    firstName,
    lastName,
    codeHash: hashEmailCode(code, email),
    expiresAt: expiresAt(),
  })
  const delivery = await sendVerificationEmail({ to: user.email, firstName: user.firstName, code })
  return pendingMailResult(user.email, code, delivery)
}

async function handleLogin(body) {
  const email = normalizeEmail(body.email || body.correo)
  const password = String(body.password || body.contrasena || '')
  const row = await getUserRowByEmail(email)
  if (!row || row.provider !== 'email') {
    throw Object.assign(new Error('Correo o contraseña incorrectos'), { status: 401 })
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    throw Object.assign(new Error('Correo o contraseña incorrectos'), { status: 401 })
  }
  if (row.email_verified === false) {
    return { needsVerification: true, email: row.email }
  }
  return { user: rowToUser(row) }
}

async function handleVerify(body) {
  const email = normalizeEmail(body.email || body.correo)
  const code = String(body.code || body.codigo || '').replace(/\s/g, '')
  const row = await getUserRowByEmail(email)
  if (!row || row.provider !== 'email') {
    throw Object.assign(new Error('No encontramos esa cuenta'), { status: 400 })
  }
  if (row.email_verified) return { user: row }
  if (!row.verify_code_expires || new Date(row.verify_code_expires).getTime() < Date.now()) {
    throw Object.assign(new Error('El código venció. Pedí uno nuevo'), { status: 400 })
  }
  if (!verifyEmailCode(code, email, row.verify_code_hash)) {
    throw Object.assign(new Error('El código no es válido'), { status: 400 })
  }
  return { user: await markEmailVerified(row.id) }
}

async function handleResend(body) {
  const email = normalizeEmail(body.email || body.correo)
  const purpose = body.purpose === 'reset' ? 'reset' : 'verify'
  const row = await getUserRowByEmail(email)
  if (!row || row.provider !== 'email') {
    throw Object.assign(new Error('No encontramos esa cuenta'), { status: 400 })
  }
  if (purpose === 'verify' && row.email_verified) {
    throw Object.assign(new Error('Esa cuenta ya está confirmada'), { status: 400 })
  }
  return issueEmailCode(rowToUser(row), purpose)
}

async function handleForgot(body) {
  const email = normalizeEmail(body.email || body.correo)
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('El correo no es válido'), { status: 400 })
  const row = await getUserRowByEmail(email)
  if (row?.provider === 'email') return issueEmailCode(rowToUser(row), 'reset')
  return { pending: true, email }
}

async function handleReset(body) {
  const email = normalizeEmail(body.email || body.correo)
  const code = String(body.code || body.codigo || '').replace(/\s/g, '')
  const password = String(body.password || body.contrasena || body.newPassword || '')
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('El correo no es válido'), { status: 400 })
  if (password.length < 8) throw Object.assign(new Error('La contraseña debe tener al menos 8 caracteres'), { status: 400 })
  const row = await getUserRowByEmail(email)
  if (!row || row.provider !== 'email') {
    throw Object.assign(new Error('No encontramos esa cuenta'), { status: 400 })
  }
  if (!row.verify_code_expires || new Date(row.verify_code_expires).getTime() < Date.now()) {
    throw Object.assign(new Error('El código venció. Pedí uno nuevo'), { status: 400 })
  }
  if (!verifyEmailCode(code, email, row.verify_code_hash)) {
    throw Object.assign(new Error('El código no es válido'), { status: 400 })
  }
  return { user: await updatePassword(row.id, await hashPassword(password)) }
}

async function handleChangePassword(req, res, body) {
  const user = await requireUser(req, res)
  if (!user) return null
  const currentPassword = String(body.currentPassword || body.password || '')
  const newPassword = String(body.newPassword || body.contrasena || '')
  if (newPassword.length < 8) throw Object.assign(new Error('La contraseña debe tener al menos 8 caracteres'), { status: 400 })
  const row = await getUserRowById(user.id)
  if (!row || row.provider !== 'email') {
    throw Object.assign(new Error('No se puede cambiar la contraseña de esta cuenta'), { status: 400 })
  }
  if (!(await verifyPassword(currentPassword, row.password_hash))) {
    throw Object.assign(new Error('La contraseña actual no es correcta'), { status: 401 })
  }
  return { user: await updatePassword(row.id, await hashPassword(newPassword)) }
}

async function handleProfile(req, res, body) {
  const sessionUser = await requireUser(req, res)
  if (!sessionUser) return null
  const firstName = String(body.firstName || body.nombre || '').trim()
  const lastName = String(body.lastName || body.apellido || '').trim()
  const email = normalizeEmail(body.email || body.correo || '')
  if (!firstName) throw Object.assign(new Error('Falta el nombre'), { status: 400 })
  if (!lastName) throw Object.assign(new Error('Falta el apellido'), { status: 400 })
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('El correo no es válido'), { status: 400 })
  const user = await updateProfile(sessionUser.id, { firstName, lastName, email })
  return { user: await startSession(res, user) }
}

async function handleGoogle(body) {
  const profile = await verifyGoogleIdToken(body.credential || body.idToken || body.token)
  const result = await upsertUser(profile)
  const items = await listItems(result.user.id)
  return {
    user: result.user,
    linked: Boolean(result.linked),
    created: Boolean(result.created),
    itemCount: items.length,
  }
}

async function handleLinkGoogle(req, res, body) {
  const sessionUser = await requireUser(req, res)
  if (!sessionUser) return null

  const profile = await verifyGoogleIdToken(body.credential || body.idToken || body.token)
  const googleOwner = await getUserRowByProvider('google', profile.providerId)

  let moved = 0
  if (googleOwner && googleOwner.id !== sessionUser.id) {
    const transfer = await transferItemsToUser(googleOwner.id, sessionUser.id)
    moved += transfer.moved
    await deleteUserAccount(googleOwner.id)
  }

  // If Google email already belongs to another account, pull its stock too.
  const emailOwner = profile.email ? await getUserRowByEmail(profile.email) : null
  if (emailOwner && emailOwner.id !== sessionUser.id) {
    const transfer = await transferItemsToUser(emailOwner.id, sessionUser.id)
    moved += transfer.moved
    await deleteUserAccount(emailOwner.id)
  }

  const user = await attachGoogleProvider(sessionUser.id, profile)
  const items = await listItems(user.id)
  return {
    user: await startSession(res, user),
    linked: true,
    moved,
    itemCount: items.length,
  }
}

/** Merge a legacy email/password account into the current Google session. */
async function handleMergeLegacy(req, res, body) {
  const sessionUser = await requireUser(req, res)
  if (!sessionUser) return null

  const email = normalizeEmail(body.email || body.correo)
  const password = String(body.password || body.contrasena || '')
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('El correo no es válido'), { status: 400 })
  if (!password) throw Object.assign(new Error('Falta la contraseña'), { status: 400 })

  const row = await getUserRowByEmail(email)
  if (!row || row.provider !== 'email') {
    throw Object.assign(new Error('No encontramos una cuenta con correo y contraseña para ese email'), {
      status: 404,
    })
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    throw Object.assign(new Error('Correo o contraseña incorrectos'), { status: 401 })
  }
  if (row.id === sessionUser.id) {
    const items = await listItems(sessionUser.id)
    return { user: sessionUser, merged: false, moved: 0, itemCount: items.length }
  }

  const transfer = await transferItemsToUser(row.id, sessionUser.id)
  await deleteUserAccount(row.id)
  const items = await listItems(sessionUser.id)
  return {
    user: sessionUser,
    merged: true,
    moved: transfer.moved,
    itemCount: items.length,
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      send(res, 200, {
        user: publicUser(await readSession(req)),
        googleClientId: googleClientId(),
      })
      return
    }

    if (req.method !== 'POST') {
      send(res, 405, { error: 'Método no permitido' })
      return
    }

    const body = await readJson(req)
    if (body.provider === 'logout') {
      destroySession(res)
      send(res, 200, { user: null })
      return
    }

    if (body.provider === 'google') {
      const result = await handleGoogle(body)
      const user = await startSession(res, result.user)
      send(res, 200, {
        user: publicUser(user),
        linked: result.linked,
        created: result.created,
        itemCount: result.itemCount,
      })
      return
    }

    if (body.provider === 'link-google') {
      const result = await handleLinkGoogle(req, res, body)
      if (!result) return
      send(res, 200, {
        user: publicUser(result.user),
        linked: true,
        moved: result.moved,
        itemCount: result.itemCount,
      })
      return
    }

    if (body.provider === 'merge-legacy') {
      const result = await handleMergeLegacy(req, res, body)
      if (!result) return
      send(res, 200, {
        user: publicUser(result.user),
        merged: result.merged,
        moved: result.moved,
        itemCount: result.itemCount,
      })
      return
    }

    if (body.provider === 'register') {
      send(res, 200, await handleRegister(body))
      return
    }

    if (body.provider === 'email') {
      const result = await handleLogin(body)
      if (result.needsVerification) {
        send(res, 403, result)
        return
      }
      const user = await startSession(res, result.user)
      send(res, 200, { user: publicUser(user) })
      return
    }

    if (body.provider === 'verify') {
      const result = await handleVerify(body)
      const user = await startSession(res, result.user)
      send(res, 200, { user: publicUser(user) })
      return
    }

    if (body.provider === 'resend') {
      send(res, 200, await handleResend(body))
      return
    }

    if (body.provider === 'forgot') {
      send(res, 200, await handleForgot(body))
      return
    }

    if (body.provider === 'reset') {
      const result = await handleReset(body)
      const user = await startSession(res, result.user)
      send(res, 200, { user: publicUser(user) })
      return
    }

    if (body.provider === 'change-password') {
      const result = await handleChangePassword(req, res, body)
      if (!result) return
      send(res, 200, { user: publicUser(result.user), ok: true })
      return
    }

    if (body.provider === 'profile') {
      const result = await handleProfile(req, res, body)
      if (!result) return
      send(res, 200, { user: publicUser(result.user), ok: true })
      return
    }

    send(res, 400, { error: 'Proveedor no válido' })
  } catch (error) {
    const status =
      error?.status ||
      (error?.code === 'NO_DATABASE' || error?.code === 'NO_AUTH' || error?.code === 'NO_MAIL' ? 503 : 401)
    send(res, status, { error: error?.message || 'No se pudo iniciar sesión' })
  }
}
