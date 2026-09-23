import { useEffect, useRef, useState } from 'react'

function GoogleGlyph() {
  return (
    <svg className="gsi-glyph" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
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
 * Google Sign-In control.
 * - variant="icon": solo logo Google (login).
 * - variant="custom": logo + texto (Perfil / Unir).
 * - variant="native": botón GIS visible.
 */
export default function GoogleSignInButton({
  clientId,
  theme = 'light',
  label = 'Continuar con Google',
  disabled = false,
  onCredential,
  className = '',
  variant = 'custom',
  showPrompt = false,
}) {
  const hitRef = useRef(null)
  const wrapRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const onCredentialRef = useRef(onCredential)
  const isIcon = variant === 'icon'

  useEffect(() => {
    onCredentialRef.current = onCredential
  }, [onCredential])

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
            if (response?.credential) onCredentialRef.current?.(response.credential)
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
          itp_support: true,
        })

        hitRef.current.innerHTML = ''
        if (isIcon) {
          window.google.accounts.id.renderButton(hitRef.current, {
            type: 'icon',
            theme: theme === 'dark' ? 'filled_black' : 'outline',
            size: 'large',
            shape: 'circle',
            locale: 'es',
          })
        } else {
          const width = Math.min(
            400,
            Math.max(260, Math.floor(wrapRef.current?.getBoundingClientRect().width || 320)),
          )
          window.google.accounts.id.renderButton(hitRef.current, {
            theme: theme === 'dark' ? 'filled_black' : 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'left',
            width,
            locale: 'es',
          })
        }

        if (showPrompt && !cancelled) {
          try {
            window.google.accounts.id.prompt()
          } catch {
            /* One Tap optional */
          }
        }

        if (!cancelled) {
          setReady(true)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'No se pudo cargar Google')
      }
    }

    mount()
    return () => {
      cancelled = true
      try {
        window.google?.accounts?.id?.cancel?.()
      } catch {
        /* ignore */
      }
    }
  }, [clientId, theme, disabled, showPrompt, isIcon])

  if (!clientId) {
    return <p className="error">Falta GOOGLE_CLIENT_ID en el servidor.</p>
  }

  const shellClass = [
    'gsi-shell',
    isIcon ? 'gsi-shell-icon' : variant === 'native' ? 'gsi-shell-native' : 'gsi-shell-custom',
    theme === 'dark' ? 'gsi-shell-dark' : 'gsi-shell-light',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={wrapRef}
      className={shellClass}
      data-ready={ready ? '1' : '0'}
      data-disabled={disabled ? '1' : '0'}
      data-variant={variant}
    >
      {variant === 'custom' || isIcon ? (
        <div className={`gsi-face${isIcon ? ' gsi-face-icon' : ''}`} aria-hidden="true">
          <GoogleGlyph />
          {!isIcon ? <span>{label}</span> : null}
        </div>
      ) : null}
      <div
        ref={hitRef}
        className={variant === 'native' ? 'gsi-native-hit' : 'gsi-hit'}
        aria-label={label}
      />
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
