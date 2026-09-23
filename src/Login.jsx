import { useCallback, useEffect, useState } from 'react'
import { fetchAuthConfig, loginWithApple, loginWithGoogle } from './auth'
import GoogleSignInButton from './GoogleSignInButton.jsx'
import AppleSignInButton from './AppleSignInButton.jsx'

function IconMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.1 21.2 8 12 12.9 2.8 8 12 3.1Z" />
      <path d="M2.8 8 12 12.9V21L2.8 16.1V8Z" opacity="0.55" />
      <path d="M21.2 8 12 12.9V21l9.2-4.9V8Z" opacity="0.38" />
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
  const [appleClientId, setAppleClientId] = useState('')
  const [appleRedirectUri, setAppleRedirectUri] = useState('')

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
        setAppleClientId(config.appleClientId || '')
        setAppleRedirectUri(config.appleRedirectUri || '')
      } catch {
        if (!cancelled) setError('No se pudo cargar el inicio de sesión')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onLoggedIn])

  const handleGoogle = useCallback(
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

  const handleApple = useCallback(
    async (payload) => {
      setBusy(true)
      setError('')
      try {
        const data = await loginWithApple(payload)
        onLoggedIn(data.user, data)
      } catch (err) {
        setError(err?.message || 'No se pudo iniciar sesión con Apple')
      } finally {
        setBusy(false)
      }
    },
    [onLoggedIn],
  )

  const hasAnyProvider = Boolean(googleClientId || appleClientId)

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
          {!hasAnyProvider ? (
            <p className="login-error">
              Falta configurar <code>GOOGLE_CLIENT_ID</code> o <code>APPLE_CLIENT_ID</code>.
            </p>
          ) : (
            <div className="login-auth-stack">
              {googleClientId ? (
                <GoogleSignInButton
                  className="login-gsi"
                  clientId={googleClientId}
                  theme={theme}
                  label="Continuar con Google"
                  disabled={busy}
                  onCredential={handleGoogle}
                />
              ) : null}
              {appleClientId ? (
                <AppleSignInButton
                  className="login-apple"
                  clientId={appleClientId}
                  redirectUri={appleRedirectUri}
                  theme={theme}
                  label="Continuar con Apple"
                  disabled={busy}
                  onSuccess={handleApple}
                />
              ) : null}
              <p className="login-sync-hint">
                Si ya tenías Stockea con Google, al entrar con Apple (mismo correo) unimos el stock
                automáticamente. También podés unir Google desde Perfil.
              </p>
            </div>
          )}
          {busy ? <p className="login-info">Conectando…</p> : null}
          {error ? <p className="login-error">{error}</p> : null}
        </div>
      </section>
    </div>
  )
}
