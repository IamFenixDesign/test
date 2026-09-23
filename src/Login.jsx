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
              const data = await loginWithGoogle(response.credential)
              onLoggedIn(data.user, data)
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
          width: Math.min(320, Math.floor(buttonRef.current.getBoundingClientRect().width) || 280),
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
            <>
              <div ref={buttonRef} className="login-google-btn" aria-label="Continuar con Google" />
              {!ready && !error ? <p className="login-copy">Cargando Google…</p> : null}
            </>
          )}
          {busy ? <p className="login-info">Conectando…</p> : null}
          {error ? <p className="login-error">{error}</p> : null}
        </div>
      </section>
    </div>
  )
}
