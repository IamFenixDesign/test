import { useState } from 'react'
import {
  loginWithEmail,
  registerWithEmail,
  requestPasswordReset,
  resendCode,
  resetPassword,
  verifyEmail,
} from './auth'

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

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
}

export default function Login({ theme, setTheme, onLoggedIn }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(emptyForm)
  const [code, setCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function go(next) {
    setMode(next)
    setError('')
    setInfo('')
    setCode('')
  }

  async function handleLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await loginWithEmail(form.email, form.password)
      if (data.needsVerification) {
        setPendingEmail(data.email || form.email)
        setMode('verify')
        setCode('')
        setError('')
        setInfo('Confirmá tu correo para entrar')
        return
      }
      onLoggedIn(data.user)
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await registerWithEmail(form)
      setPendingEmail(data.email || form.email)
      if (data.code) {
        setCode(String(data.code))
        setInfo(`Tu código es ${data.code} (el correo de prueba de Resend no llega a otros destinatarios)`)
      } else {
        setInfo('Te mandamos un código al correo')
      }
      setMode('verify')
    } catch (err) {
      setError(err?.message || 'No se pudo crear la cuenta')
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = await verifyEmail(pendingEmail || form.email, code)
      onLoggedIn(user)
    } catch (err) {
      setError(err?.message || 'No se pudo confirmar la cuenta')
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setBusy(true)
    setError('')
    try {
      const data =
        mode === 'reset'
          ? await requestPasswordReset(pendingEmail || form.email)
          : await resendCode(pendingEmail || form.email)
      if (data?.code) {
        setCode(String(data.code))
        setInfo(`Tu código es ${data.code} (sandbox Resend)`)
      } else {
        setInfo('Te mandamos un código nuevo')
      }
    } catch (err) {
      setError(err?.message || 'No se pudo reenviar el código')
    } finally {
      setBusy(false)
    }
  }

  async function handleForgot(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await requestPasswordReset(form.email)
      setPendingEmail(data.email || form.email)
      setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }))
      if (data.code) {
        setCode(String(data.code))
        setInfo(`Tu código es ${data.code} (sandbox Resend)`)
      } else {
        setInfo('Te mandamos un código al correo')
        setCode('')
      }
      setMode('reset')
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el código')
    } finally {
      setBusy(false)
    }
  }

  async function handleReset(event) {
    event.preventDefault()
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setBusy(true)
    setError('')
    try {
      const user = await resetPassword({
        email: pendingEmail || form.email,
        code,
        password: form.password,
      })
      onLoggedIn(user)
    } catch (err) {
      setError(err?.message || 'No se pudo restablecer la contraseña')
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'register'
      ? 'Creá tu cuenta'
      : mode === 'verify'
        ? 'Confirmá tu correo'
        : mode === 'forgot'
          ? 'Recuperá tu contraseña'
          : mode === 'reset'
            ? 'Nueva contraseña'
            : 'Entrá para guardar tu inventario'

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
            <p>{title}</p>
          </div>
        </div>

        {mode === 'login' && (
          <form className="login-form" onSubmit={handleLogin}>
            <label className="login-field">
              Correo
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                required
              />
            </label>
            <label className="login-field">
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                required
              />
            </label>
            <button className="login-btn login-submit" type="submit" disabled={busy}>
              Entrar
            </button>
            <button className="login-text-btn" type="button" onClick={() => go('forgot')}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form className="login-form" onSubmit={handleRegister}>
            <p className="login-copy">Completá tus datos. Te mandamos un código de 6 dígitos al correo para confirmar la cuenta.</p>
            <div className="login-row">
              <label className="login-field">
                Nombre
                <input
                  type="text"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(event) => update('firstName', event.target.value)}
                  required
                />
              </label>
              <label className="login-field">
                Apellido
                <input
                  type="text"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(event) => update('lastName', event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="login-field">
              Correo
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                required
              />
            </label>
            <label className="login-field">
              Contraseña
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                minLength={8}
                required
              />
            </label>
            <button className="login-btn login-submit" type="submit" disabled={busy}>
              Crear cuenta
            </button>
          </form>
        )}

        {mode === 'verify' && (
          <form className="login-form" onSubmit={handleVerify}>
            <p className="login-copy">
              Mandamos un código a <strong>{pendingEmail || form.email}</strong>
            </p>
            <label className="login-field">
              Código
              <input
                className="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </label>
            <button className="login-btn login-submit" type="submit" disabled={busy || code.length !== 6}>
              Confirmar cuenta
            </button>
            <button className="login-text-btn" type="button" disabled={busy} onClick={handleResend}>
              Reenviar código
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form className="login-form" onSubmit={handleForgot}>
            <p className="login-copy">Ingresá el correo de tu cuenta. Te mandamos un código para crear una contraseña nueva.</p>
            <label className="login-field">
              Correo
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                required
              />
            </label>
            <button className="login-btn login-submit" type="submit" disabled={busy}>
              Enviar código
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form className="login-form" onSubmit={handleReset}>
            <p className="login-copy">
              Mandamos un código a <strong>{pendingEmail || form.email}</strong>
            </p>
            <label className="login-field">
              Código
              <input
                className="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </label>
            <label className="login-field">
              Contraseña nueva
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="login-field">
              Repetir contraseña
              <input
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) => update('confirmPassword', event.target.value)}
                minLength={8}
                required
              />
            </label>
            <button className="login-btn login-submit" type="submit" disabled={busy || code.length !== 6}>
              Guardar contraseña
            </button>
            <button className="login-text-btn" type="button" disabled={busy} onClick={handleResend}>
              Reenviar código
            </button>
          </form>
        )}

        {info ? <p className="login-info">{info}</p> : null}
        {error ? <p className="login-error">{error}</p> : null}

        {mode === 'login' && (
          <p className="login-switch">
            ¿No tenés cuenta?{' '}
            <button type="button" onClick={() => go('register')}>
              Registrate
            </button>
          </p>
        )}
        {mode === 'register' && (
          <p className="login-switch">
            ¿Ya tenés cuenta?{' '}
            <button type="button" onClick={() => go('login')}>
              Entrá
            </button>
          </p>
        )}
        {mode === 'verify' && (
          <p className="login-switch">
            <button type="button" onClick={() => go('login')}>
              Volver al inicio
            </button>
          </p>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <p className="login-switch">
            <button type="button" onClick={() => go('login')}>
              Volver al inicio
            </button>
          </p>
        )}
      </section>
    </div>
  )
}
