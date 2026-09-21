import { deleteItem, listItems, upsertItem } from '../src/db.js'
import { readJson, send } from '../src/http.js'
import { requireUser } from '../src/session.js'

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
      send(res, 200, await upsertItem(item, user.id))
      return
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url || '/', 'http://localhost')
      const id = String(req.query?.id || url.searchParams.get('id') || '').trim()
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
