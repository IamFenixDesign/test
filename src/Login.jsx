import { useCallback, useEffect, useState } from 'react'
import { fetchAuthConfig, loginWithGoogle } from './auth'
import GoogleSignInButton from './GoogleSignInButton.jsx'

/** Cubo del favicon. La baldosa sigue el tema: oscura o clara. */
function IconMark({ theme }) {
  const light = theme === 'light'
  const tile = light ? '#f2f5ee' : '#0b0d0c'
  const limeGlow = light ? 0.45 : 0.28
  const mintGlow = light ? 0.28 : 0.22
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id="loginGlowLime" cx="18%" cy="8%" r="72%">
          <stop offset="0%" stopColor="#d4f562" stopOpacity={limeGlow} />
          <stop offset="100%" stopColor="#d4f562" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="loginGlowMint" cx="96%" cy="12%" r="68%">
          <stop offset="0%" stopColor="#7ee2b8" stopOpacity={mintGlow} />
          <stop offset="100%" stopColor="#7ee2b8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={tile} />
      <rect width="32" height="32" rx="8" fill="url(#loginGlowLime)" />
      <rect width="32" height="32" rx="8" fill="url(#loginGlowMint)" />
      <g transform="translate(16 16) scale(1.16) translate(-16 -16)">
        <path fill="#d4f562" d="M16 6.1 25.4 11.1 16 16.1 6.6 11.1Z" />
        <path fill="#7a9c24" d="M6.6 11.1 16 16.1v9.8L6.6 20.9Z" />
        <path fill="#7ee2b8" d="M25.4 11.1 16 16.1v9.8l9.4-5Z" />
      </g>
    </svg>
  )
}

export default function Login({ theme, onLoggedIn }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')
  const [configReady, setConfigReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const config = await fetchAuthConfig()
        if (cancelled) return
        if (config.user) {
          onLoggedIn(config.user)
          return
        }
        setGoogleClientId(config.googleClientId || '')
      } catch {
        if (!cancelled) setError('No se pudo cargar el inicio de sesión')
      } finally {
        if (!cancelled) setConfigReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onLoggedIn])

  const handleCredential = useCallback(
    async (credential) => {
      if (!credential || busy) return
      setBusy(true)
      setError('')
      try {
        const data = await loginWithGoogle(credential)
        if (!data?.user) {
          throw new Error('Google no devolvió una sesión válida')
        }
        onLoggedIn(data.user, data)
      } catch (err) {
        setError(err?.message || 'No se pudo iniciar sesión con Google')
        setBusy(false)
      }
    },
    [busy, onLoggedIn],
  )

  return (
    <div className="login-screen">
      <div className="login-bleed" aria-hidden="true" />

      <div className="login-body">
        <section className="login-hero">
          <div className="login-mark" aria-hidden="true">
            <IconMark theme={theme} />
          </div>
          <p className="login-kicker">Inventario</p>
          <h1 className="login-brand-name">Stockea</h1>
          <p className="login-headline">Tu stock, al día</p>
          <p className="login-support">Precios de súper y alertas en un solo lugar.</p>
        </section>

        <div className="login-cta">
          {!configReady ? (
            <p className="login-status">Cargando…</p>
          ) : !googleClientId ? (
            <p className="login-error">
              Falta configurar <code>GOOGLE_CLIENT_ID</code> en el servidor.
            </p>
          ) : (
            <GoogleSignInButton
              className="login-gsi-icon"
              clientId={googleClientId}
              theme={theme}
              variant="icon"
              label="Iniciar sesión con Google"
              disabled={busy}
              onCredential={handleCredential}
            />
          )}
          {busy ? <p className="login-status">Entrando…</p> : null}
          {error ? <p className="login-error">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
