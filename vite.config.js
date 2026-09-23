import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import itemsHandler from './api/items.js'
import authHandler from './api/auth.js'
import { searchSupermarketsServer } from './src/supermarkets.js'

async function supersMiddleware(req, res, next) {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname !== '/api/supers') {
    next()
    return
  }

  const q = (url.searchParams.get('q') || '').trim()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (!q) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Falta el término de búsqueda' }))
    return
  }

  const limitRaw = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined

  try {
    res.end(JSON.stringify(await searchSupermarketsServer(q, { limit })))
  } catch {
    res.statusCode = 502
    res.end(JSON.stringify({ error: 'No se pudieron consultar los supermercados' }))
  }
}

async function itemsMiddleware(req, res, next) {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname !== '/api/items') {
    next()
    return
  }
  req.query = Object.fromEntries(url.searchParams)
  await itemsHandler(req, res)
}

async function authMiddleware(req, res, next) {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname !== '/api/auth') {
    next()
    return
  }
  req.query = Object.fromEntries(url.searchParams)
  await authHandler(req, res)
}

function supermarketProxy() {
  return {
    name: 'supermarket-proxy',
    configureServer(server) {
      server.middlewares.use(authMiddleware)
      server.middlewares.use(itemsMiddleware)
      server.middlewares.use(supersMiddleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(authMiddleware)
      server.middlewares.use(itemsMiddleware)
      server.middlewares.use(supersMiddleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL
  if (env.POSTGRES_URL) process.env.POSTGRES_URL = env.POSTGRES_URL
  if (env.AUTH_SECRET) process.env.AUTH_SECRET = env.AUTH_SECRET
  for (const key of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_ANDROID_CLIENT_ID',
    'GOOGLE_IOS_CLIENT_ID',
    'APPLE_CLIENT_ID',
    'APPLE_SERVICES_ID',
    'APPLE_REDIRECT_URI',
    'RESEND_API_KEY',
    'RESEND_ACCOUNT_EMAIL',
    'MAIL_FROM',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_SECURE',
  ]) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/test/' : '/',
    plugins: [react(), supermarketProxy()],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
