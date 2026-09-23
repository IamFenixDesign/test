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

export async function fetchAuthConfig() {
  try {
    const data = await authRequest(null)
    return {
      user: data.user || null,
      googleClientId: data.googleClientId || '',
      appleClientId: data.appleClientId || '',
      appleRedirectUri: data.appleRedirectUri || '',
    }
  } catch {
    return { user: null, googleClientId: '', appleClientId: '', appleRedirectUri: '' }
  }
}

export async function logout() {
  try {
    await authRequest({ provider: 'logout' })
  } catch {
    /* ignore */
  }
}

export async function loginWithGoogle(credential) {
  return authRequest({ provider: 'google', credential })
}

export async function loginWithApple({ credential, email, firstName, lastName }) {
  return authRequest({
    provider: 'apple',
    credential,
    email,
    firstName,
    lastName,
  })
}

export async function linkGoogleAccount(credential) {
  return authRequest({ provider: 'link-google', credential })
}

export async function linkAppleAccount({ credential, email, firstName, lastName }) {
  return authRequest({
    provider: 'link-apple',
    credential,
    email,
    firstName,
    lastName,
  })
}

export async function mergeLegacyAccount({ email, password }) {
  return authRequest({ provider: 'merge-legacy', email, password })
}

export async function updateProfile({ firstName, lastName, email }) {
  const data = await authRequest({
    provider: 'profile',
    firstName,
    lastName,
    email,
  })
  return data.user
}
