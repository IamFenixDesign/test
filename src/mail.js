import { Resend } from 'resend'

function mailFrom() {
  return process.env.MAIL_FROM || 'Stockea <onboarding@resend.dev>'
}

function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST)
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
    to,
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
    await sendWithResend({ to, subject, html, text })
    return
  }
  await sendWithSmtp({ to, subject, html, text })
}

export async function sendVerificationEmail(payload) {
  await sendCodeEmail({ ...payload, purpose: 'verify' })
}
