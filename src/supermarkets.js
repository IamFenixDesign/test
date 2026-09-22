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

/** Coto: pesable / KGS = por kilo; el resto por unidad. */
export function cotoQtyUnit(attrs = {}) {
  const pesable = String(first(attrs['product.unidades.esPesable']) || '').trim()
  if (pesable === '1') return 'kg'
  const desc = fold(first(attrs['product.unidades.descUnidad']) || '')
  if (desc === 'kgs' || desc === 'kg' || desc === 'kilo' || desc === 'kilogramo') return 'kg'
  const name = fold(
    first(attrs['product.displayName']) || first(attrs['sku.displayName']) || '',
  )
  if (/\bx\s*kg\b|\bxkg\b|\b\/\s*kg\b|\bpor\s*kg\b/.test(name)) return 'kg'
  return 'unit'
}

/** VTEX (Carrefour / Día): measurementUnit "kg" = por kilo. */
export function vtexQtyUnit(item = {}) {
  const unit = fold(item?.measurementUnit || item?.MeasurementUnit || '')
  if (unit === 'kg' || unit === 'kilo' || unit === 'kilogramo' || unit === 'kgs') return 'kg'
  return 'unit'
}

export function qtyUnitOfProduct(product) {
  return product?.qtyUnit === 'kg' ? 'kg' : 'unit'
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
  } else if (tipo && /\d+\s*%/.test(tipo)) {
    // Solo tipos con % real (ej. "Hasta 30% DTO!!"); ignora "Otras Ofertas".
    label = tipo
    const match = tipo.match(/(\d+)\s*%/)
    if (match) percent = Number(match[1])
  }

  const dealPrice = toPrice(deal?.precioDesc)
  const shelf = cotoPrice(attrs)
  // Lista = lo que muestra Coto en la web (activePrice / precioLista).
  // No usar textoPrecioRegular "Precio Contado: $X": a menudo viene desactualizado
  // (ej. tomate web $3699 vs texto $4299).
  const regularField = toPrice(deal?.precioRegular)
  const listPrice =
    regularField > 0 && shelf > 0
      ? Math.max(regularField, shelf)
      : regularField || shelf

  const hasDiscount =
    Boolean(label) &&
    dealPrice > 0 &&
    listPrice > 0 &&
    dealPrice < listPrice * 0.999

  return {
    hasDiscount,
    discountLabel: hasDiscount ? label : '',
    discountPercent: hasDiscount ? percent : 0,
    dealPrice,
    listPrice: listPrice || shelf,
  }
}

/** Oferta/descuento de VTEX Carrefour / Día (Price vs ListPrice). */
export function carrefourOfferInfo(offer = {}) {
  const price = toPrice(offer?.Price)
  const rawList =
    toPrice(offer?.ListPrice) || toPrice(offer?.PriceWithoutDiscount) || 0
  if (!(price > 0)) {
    return { price: 0, listPrice: 0, hasDiscount: false, discountLabel: '', discountPercent: 0 }
  }
  // Siempre preferir el mayor como precio de lista (sin promo).
  const listPrice = Math.max(rawList, price)
  const hasDiscount = listPrice > price * 1.005
  const discountPercent = hasDiscount ? Math.max(1, Math.round((1 - price / listPrice) * 100)) : 0
  return {
    price,
    listPrice,
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

export function parseCoto(data, { limit = 24 } = {}) {
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
      const shelf = cotoPrice(attrs)
      const listPrice = offer.listPrice || shelf
      // Precio vigente: usa el de la oferta (precioDesc) si es menor que la lista.
      const deal = Number(offer.dealPrice) || 0
      const price =
        deal > 0 && listPrice > 0 && deal < listPrice * 0.999
          ? deal
          : deal > 0 && !(listPrice > 0)
            ? deal
            : shelf
      if (!(price > 0)) return null
      return {
        store: 'coto',
        name: String(first(attrs['product.displayName']) || first(attrs['sku.displayName']) || '').replace(/\s+/g, ' ').trim(),
        brand: String(first(attrs['product.brand']) || ''),
        department: String(first(attrs['product.LDEPAR']) || ''),
        categories: Array.isArray(attrs['allAncestors.displayName'])
          ? attrs['allAncestors.displayName']
          : [first(attrs['product.category'])].filter(Boolean),
        price,
        listPrice: listPrice || price,
        qtyUnit: cotoQtyUnit(attrs),
        hasDiscount: offer.hasDiscount && price < (listPrice || price) * 0.999,
        discountLabel: offer.discountLabel,
        discountPercent: offer.discountPercent,
        ean,
        image: String(first(attrs['product.mediumImage.url']) || ''),
        url: cotoUrl(record, sku),
      }
    })
    .filter((item) => item && item.name && item.price > 0)
    .slice(0, limit)
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
        qtyUnit: vtexQtyUnit(item),
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

export function parseCarrefour(products, { limit = 8 } = {}) {
  return parseVtexProducts(products, {
    store: 'carrefour',
    origin: 'https://www.carrefour.com.ar',
    limit,
  })
}

export function parseDia(products, { limit = 8 } = {}) {
  return parseVtexProducts(products, {
    store: 'dia',
    origin: 'https://diaonline.supermercadosdia.com.ar',
    limit,
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

export async function fetchCotoProducts(query, { limit = 24 } = {}) {
  const encoded = encodeURIComponent(query)
  const pageSize = Math.min(Math.max(limit, 12), 48)
  const urls = []
  if (isBarcode(query)) {
    const ean = barcodeDigits(query)
    urls.push(
      `https://www.coto.com.ar/sitios/cdigi/categoria?format=json&Ntt=${ean}&Ntk=product.eanPrincipal&Dy=1`,
    )
  }
  urls.push(
    `https://www.coto.com.ar/sitios/cdigi/categoria?format=json&Ntt=${encoded}&Dy=1&Nrpp=${pageSize}`,
  )
  return firstMatch(urls, (data) => parseCoto(data, { limit: pageSize }))
}

export async function fetchCarrefourProducts(query, { limit = 8 } = {}) {
  const encoded = encodeURIComponent(query)
  const pageSize = Math.min(Math.max(limit, 8), 50)
  const to = pageSize - 1
  const urls = []
  if (isBarcode(query)) {
    const ean = barcodeDigits(query)
    urls.push(
      `https://www.carrefour.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
    )
  }
  urls.push(
    `https://www.carrefour.com.ar/api/catalog_system/pub/products/search?ft=${encoded}&_from=0&_to=${to}`,
  )
  return firstMatch(urls, (data) => parseCarrefour(data, { limit: pageSize }))
}

export async function fetchDiaProducts(query, { limit = 8 } = {}) {
  const encoded = encodeURIComponent(query)
  const pageSize = Math.min(Math.max(limit, 8), 50)
  const to = pageSize - 1
  const urls = []
  if (isBarcode(query)) {
    const ean = barcodeDigits(query)
    urls.push(
      `https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
    )
  }
  urls.push(
    `https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?ft=${encoded}&_from=0&_to=${to}`,
  )
  return firstMatch(urls, (data) => parseDia(data, { limit: pageSize }))
}

export async function searchSupermarketsServer(query, { limit } = {}) {
  const q = isBarcode(query) ? barcodeDigits(query) : String(query || '').trim()
  if (!q) return { coto: [], carrefour: [], dia: [], errors: {} }

  const opts = limit ? { limit } : {}
  const [cotoResult, carrefourResult, diaResult] = await Promise.allSettled([
    fetchCotoProducts(q, opts),
    fetchCarrefourProducts(q, opts),
    fetchDiaProducts(q, opts),
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

export async function searchSupermarkets(query, { limit } = {}) {
  const q = isBarcode(query) ? barcodeDigits(query) : query.trim()
  if (!q) return { coto: [], carrefour: [], dia: [], errors: {} }

  try {
    const params = new URLSearchParams({ q })
    if (limit) params.set('limit', String(limit))
    // Evitar respuestas cacheadas: Comparar debe verse al momento
    params.set('_ts', String(Date.now()))
    const res = await fetch(`/api/supers?${params}`, { cache: 'no-store' })
    if (res.ok) return res.json()
  } catch {
    /* GitHub Pages has no API; fall back to the browser */
  }

  return searchSupermarketsServer(q, { limit })
}

export function matchByEan(product, otherList) {
  if (!product?.ean) return null
  return otherList.find((entry) => entry.ean && entry.ean === product.ean) || null
}

/** Palabras de relleno al comparar nombres entre súpers. */
const COMPARE_FILLERS = new Set([
  'x', 'kg', 'kgs', 'kilo', 'kilogramo', 'gr', 'grs', 'g', 'gramo', 'gramos',
  'ml', 'cc', 'cl', 'lt', 'l', 'litro', 'litros', 'un', 'u', 'und', 'unidad', 'unidades',
  'pack', 'paq', 'paquete', 'botella', 'sachet', 'tetra', 'ttb', 'caja', 'bolsa', 'malla',
  'porron', 'lata', 'frasco', 'pote', 'vaso', 'brick', 'brik',
  'huella', 'natural', 'classic', 'clasica', 'clasico', 'comun', 'seleccion',
  'largo', 'larga', 'vida', 'uat', 'ultra',
])

/** Variantes fuertes: si una tiene y la otra no, no son el mismo producto. */
const COMPARE_STRONG_VARIANTS = [
  ['cherry', 'cocktail'],
  ['perita'],
  ['kumato'],
  ['raf'],
  ['organico', 'organica'],
  ['deshidrat', 'deshidratado', 'deshidratada'],
  ['relleno', 'rellena'],
  ['especial'],
  ['racimo', 'rama'],
  ['comercial'],
  ['light', 'liviana', 'descremada', 'parcialmente'],
  ['enter', 'entera', 'entero'],
]

/** Sinónimos de tokens para matching (red ≈ redondo). */
const COMPARE_SYNONYMS = {
  redondo: 'red',
  red: 'red',
  cavendish: 'banana',
  seleccion: 'seleccion',
  porron: 'porron',
  cerveza: 'cerveza',
}

function canonToken(token) {
  const t = fold(token).replace(/[^a-z0-9]/g, '')
  if (!t) return ''
  if (COMPARE_SYNONYMS[t]) return COMPARE_SYNONYMS[t]
  // stemming liviano
  if (t.endsWith('es') && t.length > 5) return t.slice(0, -2)
  if (t.endsWith('s') && t.length > 4) return t.slice(0, -1)
  return t
}

function extractCompareSize(foldedName) {
  const text = fold(foldedName)
  const match =
    text.match(/\b(\d+[.,]?\d*)\s*(kg|kgs|g|gr|grs|grm|ml|cc|cl|l|lt|lts)\b/) ||
    text.match(/\b(\d+[.,]?\d*)(kg|kgs|g|gr|grs|grm|ml|cc|cl|l|lt|lts)\b/)
  if (!match) return ''
  const n = String(match[1]).replace(',', '.')
  let u = match[2]
  if (u === 'grs' || u === 'gr' || u === 'grm') u = 'g'
  if (u === 'kgs') u = 'kg'
  if (u === 'lts' || u === 'lt') u = 'l'
  if (u === 'cc') u = 'ml'
  return `${n}${u}`
}

function extractCompareVariants(tokens) {
  const found = new Set()
  const joined = tokens.join(' ')
  for (const group of COMPARE_STRONG_VARIANTS) {
    if (group.some((v) => tokens.includes(v) || joined.includes(v))) {
      found.add(group[0])
    }
  }
  return found
}

/** Identidad comparable de un producto entre Coto / Carrefour / Día. */
export function compareProductIdentity(product) {
  const name = String(product?.name || '')
  const folded = fold(name)
  const size = extractCompareSize(folded)
  const unit = product?.qtyUnit === 'kg' ? 'kg' : 'unit'
  const rawTokens = folded
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map(canonToken)
    .filter(Boolean)
  const seen = new Set()
  const tokens = []
  for (const t of rawTokens) {
    if (COMPARE_FILLERS.has(t) || /^\d+$/.test(t) || seen.has(t)) continue
    seen.add(t)
    tokens.push(t)
  }
  const variants = extractCompareVariants(tokens)
  const brand = canonToken(product?.brand || '')
  return { unit, size, tokens, variants, brand, folded }
}

function variantsCompatible(a, b) {
  const onlyA = [...a.variants].filter((v) => !b.variants.has(v))
  const onlyB = [...b.variants].filter((v) => !a.variants.has(v))
  if (!onlyA.length && !onlyB.length) return true
  // Una sola tiene variante fuerte → distinto producto (ej. cherry vs redondo).
  if (onlyA.length && onlyB.length) return false
  const extra = onlyA.length ? onlyA : onlyB
  // "especial" / "racimo" sin contraparte: no fusionar con el genérico.
  return extra.length === 0
}

/** Score 0–100+; umbral típico ~48 para aceptar match por nombre. */
export function scoreCompareMatch(seed, candidate) {
  if (!seed || !candidate) return 0
  const a = compareProductIdentity(seed)
  const b = compareProductIdentity(candidate)
  if (a.unit !== b.unit) return 0
  // Si alguno declara tamaño (500g, 1l…), ambos deben coincidir.
  if (a.size || b.size) {
    if (!a.size || !b.size || a.size !== b.size) return 0
  }
  if (!variantsCompatible(a, b)) return 0

  const weakBrand = new Set([
    'dia',
    'carrefour',
    'coto',
    'classic',
    'clasica',
    'clasico',
    'huella',
    'huellanatural',
    'natural',
    'generico',
    'comun',
    '',
  ])
  const brandA = a.brand && !weakBrand.has(a.brand) ? a.brand : ''
  const brandB = b.brand && !weakBrand.has(b.brand) ? b.brand : ''

  // Marca solo exige en envasados; en kg (verdura/fruta) suele ser marca propia irrelevante.
  if (a.unit === 'unit') {
    if (brandA && brandB && brandA !== brandB) return 0
    if (brandA && !brandB && !b.folded.includes(brandA) && !b.tokens.includes(brandA)) return 0
    if (brandB && !brandA && !a.folded.includes(brandB) && !a.tokens.includes(brandB)) return 0
  }

  const setA = new Set(a.tokens)
  const setB = new Set(b.tokens)
  if (!setA.size || !setB.size) return 0
  const inter = [...setA].filter((t) => setB.has(t))
  if (!inter.length) return 0

  const genericTokens = new Set([
    'leche',
    'agua',
    'aceite',
    'arroz',
    'azucar',
    'sal',
    'yogur',
    'yogurt',
    'jugo',
    'pan',
    'queso',
    'crema',
    'manteca',
    'huevo',
    'cerveza',
    'vino',
    'gaseosa',
    'fideo',
    'harina',
    'cafe',
    'te',
    'galletita',
    'entera',
    'enter',
    'descremada',
    'light',
    'polvo',
    'sabor',
  ])

  // Envasados: más de un token, o misma marca fuerte.
  if (a.unit === 'unit' && inter.length < 2 && !(brandA && brandA === brandB)) {
    return 0
  }

  // Envasados sin marca fuerte: evitar “leche entera 1l” genérico entre súpers.
  if (a.unit === 'unit' && !brandA && !brandB) {
    const specific = inter.filter((t) => !genericTokens.has(t))
    if (specific.length < 1 || inter.length < 3) return 0
  }

  // Exigir al menos un token "cabeza" compartido (producto base).
  const headA = a.tokens[0]
  const headB = b.tokens[0]
  if (headA && headB && headA !== headB && !inter.includes(headA) && !inter.includes(headB)) {
    return 0
  }

  const union = new Set([...setA, ...setB])
  let score = (inter.length / union.size) * 70
  if (a.size && a.size === b.size) score += 18
  if (a.unit === 'kg') score += 8
  if (brandA && brandB && brandA === brandB) score += 16
  if (inter.length >= 2) score += 10
  if (inter.length >= 3) score += 8
  if (a.folded.includes(inter[0]) && b.folded.includes(inter[0])) score += 4
  return score
}

const COMPARE_NAME_MATCH_MIN = 48

/**
 * Busca el mejor par en otra lista: primero EAN, luego nombre/unidad/tamaño.
 * `used` es un Set de índices ya tomados.
 * @returns {number} índice o -1
 */
export function findCompareMatchIndex(seed, list, used = new Set()) {
  if (!seed || !Array.isArray(list) || !list.length) return -1

  if (seed.ean) {
    const byEan = list.findIndex(
      (product, index) => !used.has(index) && product.ean && product.ean === seed.ean,
    )
    if (byEan >= 0) return byEan
  }

  let bestIdx = -1
  let bestScore = 0
  let bestClose = -Infinity
  list.forEach((product, index) => {
    if (used.has(index)) return
    const score = scoreCompareMatch(seed, product)
    if (score < COMPARE_NAME_MATCH_MIN) return
    const seedId = compareProductIdentity(seed)
    const otherId = compareProductIdentity(product)
    const close =
      -Math.abs(seedId.tokens.length - otherId.tokens.length) * 10 -
      Math.abs(seedId.folded.length - otherId.folded.length)
    if (score > bestScore || (score === bestScore && close > bestClose)) {
      bestScore = score
      bestClose = close
      bestIdx = index
    }
  })
  return bestIdx
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
