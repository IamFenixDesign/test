import { useEffect, useRef, useState } from 'react'
import { fetchAuthConfig, loginWithGoogle } from './auth'

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

function IconGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3 5.8 14.9l-2.6 2c1.7 3.3 5.1 5.5 8.8 5.5 2.7 0 4.9-.9 6.5-2.4l-3.1-2.4c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1z"
      />
      <path
        fill="#4A90E2"
        d="M3.2 7.1C2.4 8.7 2 10.3 2 12s.4 3.3 1.2 4.9l3.4-2.6C6.2 13.4 6 12.7 6 12s.2-1.4.6-2L3.2 7.1z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.8c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.9 2.9 14.7 2 12 2 8.3 2 4.9 4.2 3.2 7.1L6.6 9.7C7.4 7.3 9.6 5.8 12 5.8z"
      />
    </svg>
  )
}

function loadGisScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-gis="1"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleGis = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Google'))
    document.head.appendChild(script)
  })
}

export default function Login({ theme, setTheme, onLoggedIn }) {
  const buttonRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')
  const [ready, setReady] = useState(false)

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

  useEffect(() => {
    if (!googleClientId || !buttonRef.current) return undefined
    let cancelled = false

    async function mountGoogle() {
      try {
        await loadGisScript()
        if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            setBusy(true)
            setError('')
            try {
              const user = await loginWithGoogle(response.credential)
              onLoggedIn(user)
            } catch (err) {
              setError(err?.message || 'No se pudo iniciar sesión con Google')
            } finally {
              setBusy(false)
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        })

        buttonRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 320,
          locale: 'es',
        })
        setReady(true)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'No se pudo cargar Google')
      }
    }

    mountGoogle()
    return () => {
      cancelled = true
    }
  }, [googleClientId, theme, onLoggedIn])

  return (
    <div className="login-screen">
      <button
        className="btn btn-ghost theme-toggle login-theme"
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
      <section className="login-card">
        <div className="login-brand">
          <div className="logo">
            <IconMark />
          </div>
          <div>
            <h1>Stockea</h1>
            <p>Entrá con Google para guardar tu inventario</p>
          </div>
        </div>

        <div className="login-google-wrap">
          {!googleClientId ? (
            <p className="login-error">
              Falta configurar <code>GOOGLE_CLIENT_ID</code> en el servidor.
            </p>
          ) : (
            <>
              <div ref={buttonRef} className="login-google-btn" aria-label="Continuar con Google" />
              {!ready && !error ? <p className="login-copy">Cargando Google…</p> : null}
              <button className="login-btn login-google-fallback" type="button" disabled={!ready || busy} hidden>
                <IconGoogle />
                {busy ? 'Entrando…' : 'Continuar con Google'}
              </button>
            </>
          )}
        </div>

        {busy ? <p className="login-info">Conectando con Google…</p> : null}
        {error ? <p className="login-error">{error}</p> : null}
      </section>
    </div>
  )
}
