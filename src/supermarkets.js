function first(value) {
  if (Array.isArray(value)) return value[0]
  return value
}

function toPrice(value) {
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function parseJsonField(value) {
  const raw = first(value)
  if (typeof raw === 'string' && (raw.startsWith('{') || raw.startsWith('['))) {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return raw ?? null
}

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

const CATEGORY_HINTS = [
  ['Bebidas', ['bebida', 'gaseosa', 'cerveza', 'vino', 'jugo', 'soda', 'aguas', 'sin alcohol']],
  ['Limpieza', ['limpieza', 'lavandina', 'detergente', 'limpiador', 'suavizante', 'dph']],
  ['Papelería', ['libreria', 'papeler', 'escritura', 'boligrafo', 'cuaderno', 'resma']],
  ['Insumos', ['insumo', 'descartable', 'packaging']],
  ['Alimentos', ['almacen', 'lacteo', 'fresco', 'alimento', 'carnicer', 'panader', 'fiambr', 'verduler']],
]

export function guessCategory(product) {
  const parts = [
    product?.department,
    product?.name,
    ...(Array.isArray(product?.categories) ? product.categories : []),
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split('/'))
    .map((value) => fold(value.trim()))
    .filter(Boolean)

  const haystack = parts.join(' | ')
  for (const [category, keys] of CATEGORY_HINTS) {
    if (keys.some((key) => haystack.includes(key))) return category
  }
  return 'Alimentos'
}

function collectCotoRecords(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) collectCotoRecords(item, out)
    return out
  }
  const attrs = node.attributes
  if (attrs && (attrs['sku.activePrice'] || attrs['sku.dtoPrice'])) {
    out.push(node)
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectCotoRecords(value, out)
  }
  return out
}

function cotoUrl(record, sku) {
  const state = String(record.detailsAction?.recordState || '').split('?')[0]
  if (state) return `https://www.coto.com.ar/sitios/cdigi/productos${state}`
  const id = sku.replace(/^sku/i, '')
  return id
    ? `https://www.coto.com.ar/sitios/cdigi/productos/_/R-${id}-${id}-200`
    : 'https://www.coto.com.ar/sitios/cdigi'
}

function cotoPrice(attrs) {
  const dto = parseJsonField(attrs['sku.dtoPrice'])
  const list =
    toPrice(dto?.precioLista) ||
    toPrice(first(attrs['sku.activePrice'])) ||
    toPrice(first(attrs['sku.referencePrice']))
  const unit = toPrice(dto?.precio)
  // dto.precio is often $/kg or $/L, not the list price of the pack.
  if (list > 0) return list
  if (unit > 0) return unit
  return 0
}

function findCotoResultsList(node) {
  if (!node || typeof node !== 'object') return null
  if (node['@type'] === 'Category_ResultsList') return node
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findCotoResultsList(item)
      if (found) return found
    }
    return null
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object' && value !== node.attributes) {
      const found = findCotoResultsList(value)
      if (found) return found
    }
  }
  return null
}

function flattenCotoRecords(records, out = []) {
  for (const record of records || []) {
    if (Array.isArray(record.records) && record.records.length) {
      flattenCotoRecords(record.records, out)
    } else {
      out.push(record)
    }
  }
  return out
}

export function parseCoto(data) {
  const list = findCotoResultsList(data)
  const rawRecords = list?.records?.length
    ? flattenCotoRecords(list.records)
    : collectCotoRecords(data)
  const seen = new Set()
  return rawRecords
    .map((record) => {
      const attrs = record.attributes || {}
      const sku = String(first(attrs['sku.repositoryId']) || '')
      const ean = String(first(attrs['product.eanPrincipal']) || '')
      const key = sku || ean
      if (!key || seen.has(key)) return null
      seen.add(key)
      return {
        store: 'coto',
        name: String(first(attrs['product.displayName']) || first(attrs['sku.displayName']) || '').replace(/\s+/g, ' ').trim(),
        brand: String(first(attrs['product.brand']) || ''),
        department: String(first(attrs['product.LDEPAR']) || ''),
        categories: Array.isArray(attrs['allAncestors.displayName'])
          ? attrs['allAncestors.displayName']
          : [first(attrs['product.category'])].filter(Boolean),
        price: cotoPrice(attrs),
        ean,
        image: String(first(attrs['product.mediumImage.url']) || ''),
        url: cotoUrl(record, sku),
      }
    })
    .filter((item) => item && item.name && item.price > 0)
    .slice(0, 24)
}

export function parseCarrefour(products) {
  if (!Array.isArray(products)) return []
  return products
    .map((product) => {
      const item = product.items?.[0]
      const seller =
        item?.sellers?.find((entry) => entry.sellerDefault) || item?.sellers?.[0]
      const offer = seller?.commertialOffer
      const ean = String(item?.ean || product.EAN?.[0] || '')
      const link = String(product.link || '')
      return {
        store: 'carrefour',
        name: String(product.productName || ''),
        brand: String(product.brand || ''),
        department: String(product.categories?.[0] || ''),
        categories: Array.isArray(product.categories) ? product.categories : [],
        price: toPrice(offer?.ListPrice || offer?.Price),
        ean,
        image: String(item?.images?.[0]?.imageUrl || ''),
        url: link.startsWith('http') ? link : `https://www.carrefour.com.ar${link}`,
      }
    })
    .filter((item) => item.name && item.price > 0)
    .slice(0, 8)
}

export function barcodeDigits(query) {
  return String(query || '').replace(/\D/g, '')
}

export function isBarcode(query) {
  const digits = barcodeDigits(query)
  return digits.length >= 8 && digits.length <= 14
}

const FETCH_HEADERS = {
  Accept: 'application/json,text/plain,*/*',
}

if (typeof window === 'undefined') {
  FETCH_HEADERS['User-Agent'] =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
}

async function parseJsonBody(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = (await res.text()).replace(/^\uFEFF/, '').trim()
  if (!text.startsWith('{') && !text.startsWith('[')) {
    throw new Error('Respuesta no JSON')
  }
  return JSON.parse(text)
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' })
  return parseJsonBody(res)
}

function corsProxyUrls(url) {
  return [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ]
}

async function fetchJsonMaybeCors(url) {
  try {
    return await fetchJson(url)
  } catch (directError) {
    if (typeof window === 'undefined') throw directError
    let lastError = directError
    for (const proxyUrl of corsProxyUrls(url)) {
      try {
        return await fetchJson(proxyUrl)
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }
}

async function firstMatch(urls, parse) {
  let lastError = null
  for (const url of urls) {
    try {
      const parsed = parse(await fetchJsonMaybeCors(url))
      if (parsed.length) return parsed
    } catch (err) {
      lastError = err
    }
  }
  if (lastError) throw lastError
  return []
}

export async function fetchCotoProducts(query) {
  const encoded = encodeURIComponent(query)
  const urls = []
  if (isBarcode(query)) {
    const ean = barcodeDigits(query)
    urls.push(
      `https://www.coto.com.ar/sitios/cdigi/categoria?format=json&Ntt=${ean}&Ntk=product.eanPrincipal&Dy=1`,
    )
  }
  urls.push(
    `https://www.coto.com.ar/sitios/cdigi/categoria?format=json&Ntt=${encoded}&Dy=1&Nrpp=24`,
  )
  return firstMatch(urls, parseCoto)
}

export async function fetchCarrefourProducts(query) {
  const encoded = encodeURIComponent(query)
  const urls = []
  if (isBarcode(query)) {
    const ean = barcodeDigits(query)
    urls.push(
      `https://www.carrefour.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
    )
  }
  urls.push(
    `https://www.carrefour.com.ar/api/catalog_system/pub/products/search?ft=${encoded}&_from=0&_to=9`,
  )
  return firstMatch(urls, parseCarrefour)
}

export async function searchSupermarketsServer(query) {
  const q = isBarcode(query) ? barcodeDigits(query) : String(query || '').trim()
  if (!q) return { coto: [], carrefour: [], errors: {} }

  const [cotoResult, carrefourResult] = await Promise.allSettled([
    fetchCotoProducts(q),
    fetchCarrefourProducts(q),
  ])
  return {
    coto: cotoResult.status === 'fulfilled' ? cotoResult.value : [],
    carrefour: carrefourResult.status === 'fulfilled' ? carrefourResult.value : [],
    errors: {
      coto: cotoResult.status === 'rejected' ? 'Coto no respondió' : null,
      carrefour: carrefourResult.status === 'rejected' ? 'Carrefour no respondió' : null,
    },
  }
}

export async function searchSupermarkets(query) {
  const q = isBarcode(query) ? barcodeDigits(query) : query.trim()
  if (!q) return { coto: [], carrefour: [], errors: {} }

  try {
    const res = await fetch(`/api/supers?q=${encodeURIComponent(q)}`)
    if (res.ok) return res.json()
  } catch {
    /* GitHub Pages has no API; fall back to the browser */
  }

  return searchSupermarketsServer(q)
}

export function matchByEan(product, otherList) {
  if (!product?.ean) return null
  return otherList.find((entry) => entry.ean && entry.ean === product.ean) || null
}

export function cheaperOf(priceCoto, priceCarrefour) {
  const coto = Number(priceCoto) || 0
  const carrefour = Number(priceCarrefour) || 0
  if (coto > 0 && carrefour > 0) return coto <= carrefour ? 'coto' : 'carrefour'
  if (coto > 0) return 'coto'
  if (carrefour > 0) return 'carrefour'
  return null
}
