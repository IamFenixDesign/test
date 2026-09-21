import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
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

  try {
    res.end(JSON.stringify(await searchSupermarketsServer(q)))
  } catch {
    res.statusCode = 502
    res.end(JSON.stringify({ error: 'No se pudieron consultar los supermercados' }))
  }
}

function supermarketProxy() {
  return {
    name: 'supermarket-proxy',
    configureServer(server) {
      server.middlewares.use(supersMiddleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(supersMiddleware)
    },
  }
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/test/' : '/',
  plugins: [react(), supermarketProxy()],
})
