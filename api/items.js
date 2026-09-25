import { deleteItem, listItems, upsertItem } from '../src/db.js'
import { readJson, send } from '../src/http.js'
import { requireUser } from '../src/session.js'

function stockCode(value) {
  const raw = String(value || '')
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 13) return digits.slice(-13)
  return digits.length >= 8 ? digits : ''
}

function stockName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function sameStockProduct(a, b) {
  const codeA = stockCode(a?.barcode)
  const codeB = stockCode(b?.barcode)
  if (codeA && codeB) return codeA === codeB
  const nameA = stockName(a?.name)
  const nameB = stockName(b?.name)
  return Boolean(nameA) && nameA === nameB
}

export default async function handler(req, res) {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    if (req.method === 'GET') {
      send(res, 200, await listItems(user.id))
      return
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const item = await readJson(req)
      if (!item?.id || !item?.name) {
        send(res, 400, { error: 'Faltan datos del ítem' })
        return
      }
      const current = await listItems(user.id)
      if (current.some((entry) => entry.id !== item.id && sameStockProduct(entry, item))) {
        send(res, 409, { error: 'Ya está agregado' })
        return
      }
      send(res, 200, await upsertItem(item, user.id))
      return
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url || '/', 'http://localhost')
      let id = String(req.query?.id || url.searchParams.get('id') || '').trim()
      if (!id) {
        const body = await readJson(req).catch(() => ({}))
        id = String(body?.id || '').trim()
      }
      if (!id) {
        send(res, 400, { error: 'Falta el id' })
        return
      }
      await deleteItem(id, user.id)
      send(res, 200, { ok: true })
      return
    }

    send(res, 405, { error: 'Método no permitido' })
  } catch (error) {
    const status = error?.code === 'NO_DATABASE' ? 503 : 500
    send(res, status, { error: status === 503 ? 'Neon no está configurado' : 'No se pudo guardar en Neon' })
  }
}
