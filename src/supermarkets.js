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

function parseMaybeArray(value) {
  const raw = first(value)
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') return [raw]
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) return parsed
        if (parsed && typeof parsed === 'object') return [parsed]
      } catch {
        return []
      }
    }
  }
  return []
}

/** Oferta/descuento publicado en Coto Digital. */
export function cotoOfferInfo(attrs = {}) {
  const deals = parseMaybeArray(attrs['product.dtoDescuentos'])
  const deal = deals[0] || null
  const tipos = Array.isArray(attrs['product.tipoOferta'])
    ? attrs['product.tipoOferta'].map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const tipo = tipos.find((value) => !/^todas las ofertas$/i.test(value)) || ''

  let label = ''
  let percent = 0
  if (deal?.textoDescuento) {
    label = String(deal.textoDescuento).trim()
    const match = label.match(/(\d+)\s*%/)
    if (match) percent = Number(match[1])
  } else if (tipo) {
    label = tipo
  }

  const dealPrice = toPrice(deal?.precioDesc)
  return {
    hasDiscount: Boolean(label),
    discountLabel: label,
    discountPercent: percent,
    dealPrice,
  }
}

/** Oferta/descuento de VTEX Carrefour (Price vs ListPrice). */
export function carrefourOfferInfo(offer = {}) {
  const price = toPrice(offer?.Price)
  const listPrice =
    toPrice(offer?.ListPrice) || toPrice(offer?.PriceWithoutDiscount) || price
  if (!(price > 0)) {
    return { price: 0, listPrice: 0, hasDiscount: false, discountLabel: '', discountPercent: 0 }
  }
  const hasDiscount = listPrice > price * 1.005
  const discountPercent = hasDiscount ? Math.max(1, Math.round((1 - price / listPrice) * 100)) : 0
  return {
    price,
    listPrice: hasDiscount ? listPrice : price,
    hasDiscount,
    discountLabel: hasDiscount ? `${discountPercent}% OFF` : '',
    discountPercent,
  }
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
      const offer = cotoOfferInfo(attrs)
      return {
        store: 'coto',
        name: String(first(attrs['product.displayName']) || first(attrs['sku.displayName']) || '').replace(/\s+/g, ' ').trim(),
        brand: String(first(attrs['product.brand']) || ''),
        department: String(first(attrs['product.LDEPAR']) || ''),
        categories: Array.isArray(attrs['allAncestors.displayName'])
          ? attrs['allAncestors.displayName']
          : [first(attrs['product.category'])].filter(Boolean),
        price: cotoPrice(attrs),
        hasDiscount: offer.hasDiscount,
        discountLabel: offer.discountLabel,
        discountPercent: offer.discountPercent,
        ean,
        image: String(first(attrs['product.mediumImage.url']) || ''),
        url: cotoUrl(record, sku),
      }
    })
    .filter((item) => item && item.name && item.price > 0)
    .slice(0, 24)
}

function parseVtexProducts(products, { store, origin, limit = 8 }) {
  if (!Array.isArray(products)) return []
  return products
    .map((product) => {
      const item = product.items?.[0]
      const seller =
        item?.sellers?.find((entry) => entry.sellerDefault) || item?.sellers?.[0]
      const offer = seller?.commertialOffer
      const pricing = carrefourOfferInfo(offer || {})
      const ean = String(item?.ean || product.EAN?.[0] || '')
      const link = String(product.link || '')
      return {
        store,
        name: String(product.productName || ''),
        brand: String(product.brand || ''),
        department: String(product.categories?.[0] || ''),
        categories: Array.isArray(product.categories) ? product.categories : [],
        price: pricing.price,
        listPrice: pricing.listPrice,
        hasDiscount: pricing.hasDiscount,
        discountLabel: pricing.discountLabel,
        discountPercent: pricing.discountPercent,
        ean,
        image: String(item?.images?.[0]?.imageUrl || ''),
        url: link.startsWith('http') ? link : `${origin}${link}`,
      }
    })
    .filter((item) => item.name && item.price > 0)
    .slice(0, limit)
}

export function parseCarrefour(products) {
  return parseVtexProducts(products, {
    store: 'carrefour',
    origin: 'https://www.carrefour.com.ar',
    limit: 8,
  })
}

export function parseDia(products) {
  return parseVtexProducts(products, {
    store: 'dia',
    origin: 'https://diaonline.supermercadosdia.com.ar',
    limit: 8,
  })
}

export function barcodeDigits(query) {
  return String(query || '').replace(/\D/g, '')
}

export function isBarcode(query) {
  const digits = barcodeDigits(query)
  return digits.length >= 8 && digits.length <= 14
}

export function isValidEan13Checksum(digits) {
  const ean = barcodeDigits(digits)
  if (ean.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i += 1) {
    sum += Number(ean[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = (10 - (sum % 10)) % 10
  return check === Number(ean[12])
}

/** Extrae un EAN-13 si el escaneo contiene 13 dígitos (UPC-A de 12 → EAN con 0). */
export function extractEan13(query) {
  const raw = String(query || '')
  if (!raw.trim()) return ''

  const compact = raw.replace(/\s/g, '')
  const runs = compact.match(/\d{13}/g) || []
  const digits = barcodeDigits(raw)
  const candidates = [...runs]

  if (digits.length === 13) candidates.push(digits)
  if (digits.length === 12) candidates.push(`0${digits}`)
  if (digits.length > 13) {
    for (let i = 0; i <= digits.length - 13; i += 1) {
      candidates.push(digits.slice(i, i + 13))
    }
  }

  const unique = [...new Set(candidates.filter((value) => value.length === 13))]
  if (!unique.length) return ''

  const withChecksum = unique.find(isValidEan13Checksum)
  if (withChecksum) return withChecksum
  if (runs[0]) return runs[0]
  if (digits.length === 13) return digits
  if (digits.length === 12) return `0${digits}`
  return unique[0] || ''
}

export function isEan13(query) {
  return extractEan13(query).length === 13
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

export async function fetchDiaProducts(query) {
  const encoded = encodeURIComponent(query)
  const urls = []
  if (isBarcode(query)) {
    const ean = barcodeDigits(query)
    urls.push(
      `https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
    )
  }
  urls.push(
    `https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?ft=${encoded}&_from=0&_to=9`,
  )
  return firstMatch(urls, parseDia)
}

export async function searchSupermarketsServer(query) {
  const q = isBarcode(query) ? barcodeDigits(query) : String(query || '').trim()
  if (!q) return { coto: [], carrefour: [], dia: [], errors: {} }

  const [cotoResult, carrefourResult, diaResult] = await Promise.allSettled([
    fetchCotoProducts(q),
    fetchCarrefourProducts(q),
    fetchDiaProducts(q),
  ])
  return {
    coto: cotoResult.status === 'fulfilled' ? cotoResult.value : [],
    carrefour: carrefourResult.status === 'fulfilled' ? carrefourResult.value : [],
    dia: diaResult.status === 'fulfilled' ? diaResult.value : [],
    errors: {
      coto: cotoResult.status === 'rejected' ? 'Coto no respondió' : null,
      carrefour: carrefourResult.status === 'rejected' ? 'Carrefour no respondió' : null,
      dia: diaResult.status === 'rejected' ? 'Día no respondió' : null,
    },
  }
}

export async function searchSupermarkets(query) {
  const q = isBarcode(query) ? barcodeDigits(query) : query.trim()
  if (!q) return { coto: [], carrefour: [], dia: [], errors: {} }

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

export function cheaperOf(priceCoto, priceCarrefour, priceDia = 0) {
  const entries = [
    ['coto', Number(priceCoto) || 0],
    ['carrefour', Number(priceCarrefour) || 0],
    ['dia', Number(priceDia) || 0],
  ].filter(([, price]) => price > 0)
  if (!entries.length) return null
  return entries.sort((a, b) => a[1] - b[1])[0][0]
}
