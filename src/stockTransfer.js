/** Shared Stockea stock list transfer format (web + Android). */

export const STOCK_EXPORT_VERSION = 1
export const STOCK_EXPORT_APP = 'stockea'

export function buildStockExport(items) {
  return {
    version: STOCK_EXPORT_VERSION,
    app: STOCK_EXPORT_APP,
    exportedAt: new Date().toISOString(),
    items: Array.isArray(items) ? items : [],
  }
}

export function serializeStockExport(items) {
  return `${JSON.stringify(buildStockExport(items), null, 2)}\n`
}

/**
 * Accepts either `{ items: [...] }` Stockea export or a bare items array.
 * @returns {{ items: object[] }}
 */
export function parseStockExport(raw) {
  let data
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new Error('El archivo no es un JSON válido')
  }

  let list
  if (Array.isArray(data)) {
    list = data
  } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
    list = data.items
  } else {
    throw new Error('No encontramos una lista de productos en el archivo')
  }

  if (!list.length) throw new Error('La lista está vacía')

  const items = list
    .filter((entry) => entry && typeof entry === 'object' && String(entry.name || '').trim())
    .map((entry) => {
      const id = String(entry.id || '').trim() || crypto.randomUUID()
      return {
        ...entry,
        id,
        name: String(entry.name || '').trim(),
        barcode: String(entry.barcode || '').trim(),
        category: String(entry.category || 'Alimentos').trim() || 'Alimentos',
      }
    })

  if (!items.length) throw new Error('No hay productos válidos para importar')
  return { items }
}

export function mergeStockLists(current, incoming) {
  const byId = new Map()
  for (const item of current || []) {
    if (item?.id) byId.set(item.id, item)
  }
  let added = 0
  let updated = 0
  for (const item of incoming || []) {
    if (!item?.id) continue
    if (byId.has(item.id)) updated += 1
    else added += 1
    byId.set(item.id, item)
  }
  return { items: [...byId.values()], added, updated }
}
