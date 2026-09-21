async function authRequest(payload) {
  const res = await fetch('/api/auth', {
    method: payload ? 'POST' : 'GET',
    credentials: 'include',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (data.needsVerification) return data
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión')
  return data
}

export async function fetchMe() {
  try {
    const data = await authRequest(null)
    return data.user || null
  } catch {
    return null
  }
}

export async function logout() {
  try {
    await authRequest({ provider: 'logout' })
  } catch {
    /* ignore */
  }
}

export async function registerWithEmail(fields) {
  return authRequest({
    provider: 'register',
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    password: fields.password,
  })
}

export async function loginWithEmail(email, password) {
  return authRequest({ provider: 'email', email, password })
}

export async function verifyEmail(email, code) {
  const data = await authRequest({ provider: 'verify', email, code })
  return data.user
}

export async function resendCode(email) {
  return authRequest({ provider: 'resend', email })
}
