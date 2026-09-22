import { searchSupermarketsServer } from '../src/supermarkets.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Método no permitido' }))
    return
  }

  const q = String(req.query?.q || '').trim()
  if (!q) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Falta el término de búsqueda' }))
    return
  }

  const limitRaw = Number(req.query?.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined

  try {
    res.statusCode = 200
    res.end(JSON.stringify(await searchSupermarketsServer(q, { limit })))
  } catch {
    res.statusCode = 502
    res.end(JSON.stringify({ error: 'No se pudieron consultar los supermercados' }))
  }
}
