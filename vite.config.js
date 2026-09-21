import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fetchCarrefourProducts, fetchCotoProducts } from './src/supermarkets.js'

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
    const [cotoResult, carrefourResult] = await Promise.allSettled([
      fetchCotoProducts(q),
      fetchCarrefourProducts(q),
    ])

    res.end(
      JSON.stringify({
        coto: cotoResult.status === 'fulfilled' ? cotoResult.value : [],
        carrefour: carrefourResult.status === 'fulfilled' ? carrefourResult.value : [],
        errors: {
          coto: cotoResult.status === 'rejected' ? 'Coto no respondió' : null,
          carrefour: carrefourResult.status === 'rejected' ? 'Carrefour no respondió' : null,
        },
      }),
    )
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
