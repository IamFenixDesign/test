import { useEffect, useRef, useState } from 'react'

function IconGoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="login-google-g">
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

/**
 * Custom Stockea-styled Google button. The official GIS control sits invisible
 * on top so dark theme never shows Google's white iframe chrome.
 */
export default function GoogleSignInButton({
  clientId,
  theme = 'dark',
  label = 'Continuar con Google',
  disabled = false,
  onCredential,
  onError,
  onReady,
}) {
  const hitRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!clientId || !hitRef.current || disabled) return undefined
    let cancelled = false

    async function mount() {
      try {
        await loadGisScript()
        if (cancelled || !window.google?.accounts?.id || !hitRef.current) return

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) onCredential?.(response.credential)
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        })

        const width = Math.min(
          320,
          Math.max(240, Math.floor(hitRef.current.getBoundingClientRect().width) || 280),
        )
        hitRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(hitRef.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width,
          locale: 'es',
        })
        if (!cancelled) {
          setReady(true)
          onReady?.(true)
        }
      } catch (err) {
        if (!cancelled) {
          setReady(false)
          onReady?.(false)
          onError?.(err?.message || 'No se pudo cargar Google')
        }
      }
    }

    mount()
    return () => {
      cancelled = true
    }
  }, [clientId, theme, disabled, onCredential, onError, onReady])

  return (
    <div className={`login-google-shell${disabled ? ' is-disabled' : ''}`}>
      <div className="login-google-face" aria-hidden="true">
        <IconGoogleMark />
        <span>{label}</span>
      </div>
      <div
        ref={hitRef}
        className="login-google-hit"
        aria-label={label}
        title={label}
      />
      {!ready && !disabled ? <span className="login-google-loading">Cargando Google…</span> : null}
    </div>
  )
}
