export async function fetchRemoteItems() {
  try {
    const res = await fetch('/api/items', { credentials: 'include' })
    if (res.status === 401) return null
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

export async function upsertRemoteItem(item) {
  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteRemoteItem(id) {
  try {
    const res = await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    return res.ok
  } catch {
    return false
  }
}
