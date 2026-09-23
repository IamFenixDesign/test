import { useCallback, useEffect, useState } from 'react'
import { fetchAuthConfig, loginWithGoogle } from './auth'
import GoogleSignInButton from './GoogleSignInButton.jsx'

function IconMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path fill="#d4f562" d="M16 6.1 25.4 11.1 16 16.1 6.6 11.1Z" />
      <path fill="#7a9c24" d="M6.6 11.1 16 16.1v9.8L6.6 20.9Z" />
      <path fill="#7ee2b8" d="M25.4 11.1 16 16.1v9.8l9.4-5Z" />
    </svg>
  )
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7 4.9 19.1M19.1 4.9l-1.4 1.4" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />
    </svg>
  )
}

export default function Login({ theme, setTheme, onLoggedIn }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')

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
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onLoggedIn])

  const handleCredential = useCallback(
    async (credential) => {
      setBusy(true)
      setError('')
      try {
        const data = await loginWithGoogle(credential)
        onLoggedIn(data.user, data)
      } catch (err) {
        setError(err?.message || 'No se pudo iniciar sesión con Google')
      } finally {
        setBusy(false)
      }
    },
    [onLoggedIn],
  )

  return (
    <div className="login-screen">
      <div className="login-atmosphere" aria-hidden="true">
        <span className="login-orb login-orb-a" />
        <span className="login-orb login-orb-b" />
        <span className="login-grid" />
      </div>

      <button
        className="btn btn-ghost theme-toggle login-theme"
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>

      <section className="login-hero">
        <div className="login-mark" aria-hidden="true">
          <IconMark />
        </div>
        <p className="login-brand-name">Stockea</p>
        <h1 className="login-headline">Tu stock, al día</h1>
        <p className="login-support">Precios de súper y alertas en un solo lugar.</p>

        <div className="login-cta">
          {!googleClientId ? (
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
          {error ? <p className="login-error">{error}</p> : null}
        </div>
      </section>
    </div>
  )
}
