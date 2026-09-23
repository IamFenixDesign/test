import { useCallback, useEffect, useState } from 'react'

function AppleGlyph({ theme = 'light' }) {
  const fill = theme === 'dark' ? '#000' : '#fff'
  return (
    <svg className="apple-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={fill}
        d="M16.37 12.64c.02-2.16 1.77-3.2 1.85-3.25-1.01-1.47-2.58-1.67-3.14-1.69-1.34-.14-2.61.79-3.29.79-.68 0-1.73-.77-2.85-.75-1.47.02-2.82.85-3.57 2.17-1.53 2.65-.39 6.57 1.09 8.72.73 1.05 1.59 2.23 2.73 2.19 1.1-.05 1.51-.7 2.84-.7 1.32 0 1.7.7 2.85.68 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.36-3.57zM14.2 5.98c.6-.73 1.01-1.74.9-2.75-.87.03-1.92.58-2.54 1.31-.56.64-1.05 1.68-.92 2.66 1.01.08 2.04-.51 2.56-1.22z"
      />
    </svg>
  )
}

function loadAppleScript() {
  if (window.AppleID?.auth) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-apple-auth="1"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Apple')), {
        once: true,
      })
      return
    }
    const script = document.createElement('script')
    script.src =
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
    script.async = true
    script.dataset.appleAuth = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Apple'))
    document.head.appendChild(script)
  })
}

/**
 * Sign in with Apple.
 * onSuccess({ credential, email, firstName, lastName })
 */
export default function AppleSignInButton({
  clientId,
  redirectUri,
  theme = 'light',
  label = 'Continuar con Apple',
  disabled = false,
  onSuccess,
  className = '',
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!clientId) return undefined
    let cancelled = false
    ;(async () => {
      try {
        await loadAppleScript()
        if (cancelled || !window.AppleID?.auth) return
        const uri = redirectUri || `${window.location.origin}${window.location.pathname || '/'}`
        window.AppleID.auth.init({
          clientId,
          scope: 'name email',
          redirectURI: uri.replace(/\/$/, '') || window.location.origin,
          usePopup: true,
        })
        if (!cancelled) {
          setReady(true)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'No se pudo cargar Apple')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId, redirectUri])

  const handleClick = useCallback(async () => {
    if (!ready || disabled || busy || !window.AppleID?.auth) return
    setBusy(true)
    setError('')
    try {
      const response = await window.AppleID.auth.signIn()
      const credential = response?.authorization?.id_token
      if (!credential) throw new Error('Apple no devolvió un token')
      const name = response?.user?.name || {}
      onSuccess?.({
        credential,
        email: response?.user?.email || '',
        firstName: name.firstName || '',
        lastName: name.lastName || '',
      })
    } catch (err) {
      const code = err?.error || err?.message || ''
      if (String(code).includes('popup_closed') || String(code).includes('user_cancelled')) {
        /* user cancelled */
      } else {
        setError(err?.message || 'No se pudo iniciar sesión con Apple')
      }
    } finally {
      setBusy(false)
    }
  }, [ready, disabled, busy, onSuccess])

  if (!clientId) {
    return null
  }

  return (
    <div className={`apple-shell ${className}`.trim()} data-theme={theme}>
      <button
        type="button"
        className={`apple-signin-btn apple-signin-${theme === 'dark' ? 'dark' : 'light'}`}
        disabled={disabled || busy || !ready}
        onClick={handleClick}
      >
        <AppleGlyph theme={theme === 'dark' ? 'dark' : 'light'} />
        <span>{busy ? 'Conectando…' : label}</span>
      </button>
      {!ready && !error ? <p className="gsi-status">Cargando Apple…</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
