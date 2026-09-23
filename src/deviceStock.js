/** Collect stock lists saved under any localStorage key for this app. */

const STORAGE_PREFIX = 'stockly-items-v2'

export function collectDeviceStockItems() {
  const byId = new Map()
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue
      let parsed
      try {
        parsed = JSON.parse(localStorage.getItem(key) || '[]')
      } catch {
        continue
      }
      if (!Array.isArray(parsed)) continue
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue
        const id = String(item.id || '').trim()
        const name = String(item.name || '').trim()
        if (!id || !name) continue
        byId.set(id, item)
      }
    }
  } catch {
    /* private mode / blocked storage */
  }
  return [...byId.values()]
}

export function clearDeviceStockCaches(keepUserId) {
  try {
    const remove = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue
      if (keepUserId && key === `${STORAGE_PREFIX}:${keepUserId}`) continue
      remove.push(key)
    }
    remove.forEach((key) => localStorage.removeItem(key))
  } catch {
    /* ignore */
  }
}
