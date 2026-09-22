import { Resend } from 'resend'

function mailFrom() {
  return process.env.MAIL_FROM || 'Stockea <onboarding@resend.dev>'
}

function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST)
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

/** Resend's shared testing sender — only delivers to the account owner. */
export function isResendSandboxFrom(from = mailFrom()) {
  return /@resend\.dev\b/i.test(String(from || ''))
}

export function resendAccountEmail() {
  return normalizeEmail(process.env.RESEND_ACCOUNT_EMAIL || 'julian.javier95@hotmail.com')
}

function isSandboxRecipientError(error) {
  const msg = String(error?.message || error || '')
  return /only send testing emails|verify a domain at resend\.com\/domains/i.test(msg)
}

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

async function sendWithResend({ to, subject, html, text }) {
  const resend = getResend()
  const { error } = await resend.emails.send({
    from: mailFrom(),
    to: normalizeEmail(to),
    subject,
    html,
    text,
  })
  if (error) throw new Error(error.message || 'No se pudo enviar el correo')
}

async function sendWithSmtp({ to, subject, html, text }) {
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject,
    html,
    text,
  })
}

/**
 * @returns {Promise<{ delivered: boolean, sandbox?: boolean }>}
 */
export async function sendCodeEmail({ to, firstName, code, purpose = 'verify' }) {
  if (!mailConfigured()) {
    const error = new Error('Falta configurar el envío de correo')
    error.code = 'NO_MAIL'
    throw error
  }

  const greeting = firstName ? `Hola ${firstName}` : 'Hola'
  const action = purpose === 'reset' ? 'restablecer tu contraseña' : 'confirmar tu cuenta'
  const subject = `${code} es tu código de Stockea`
  const text = `${greeting},\n\nTu código para ${action} es ${code}.\nVence en 15 minutos.\n\nSi no pediste esto, ignorá este correo.`
  const html = `
    <div style="background:#0b0d0c;color:#eef4ea;padding:32px 24px;font-family:Arial,sans-serif;border-radius:16px">
      <p style="margin:0 0 8px;color:#d4f562;font-weight:800;letter-spacing:-0.03em;font-size:20px">Stockea</p>
      <p style="margin:0 0 18px;color:#8b9688">${greeting}, usá este código para ${action}:</p>
      <p style="margin:0 0 18px;font-size:32px;letter-spacing:0.28em;font-weight:800;color:#d4f562">${code}</p>
      <p style="margin:0;color:#8b9688;font-size:13px">Vence en 15 minutos. Si no pediste esto, ignorá este correo.</p>
    </div>
  `

  if (process.env.RESEND_API_KEY) {
    const recipient = normalizeEmail(to)
    // Shared resend.dev sender cannot deliver to anyone except the account email.
    if (isResendSandboxFrom() && recipient !== resendAccountEmail()) {
      return { delivered: false, sandbox: true }
    }
    try {
      await sendWithResend({ to: recipient, subject, html, text })
      return { delivered: true }
    } catch (error) {
      if (isSandboxRecipientError(error)) {
        return { delivered: false, sandbox: true }
      }
      throw error
    }
  }

  await sendWithSmtp({ to, subject, html, text })
  return { delivered: true }
}

export async function sendVerificationEmail(payload) {
  return sendCodeEmail({ ...payload, purpose: 'verify' })
}
