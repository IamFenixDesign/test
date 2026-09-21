function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Heurísticas de exclusiones típicas de Visa Débito NFC en Coto. */
const VISA_NFC_COTO_EXCLUSIONS = [
  'electro',
  'heladera',
  'lavarropa',
  'notebook',
  'televisor',
  'smart tv',
  'neumatic',
  'bicicleta',
  'patin',
  'rodado',
  'estacionamiento',
  'coto bar',
  'coto express',
  'catena',
  'rutini',
  'trumpeter',
  'chandon',
  'terrazas',
  'saint felicien',
  'alma negra',
]

/** 0=Dom … 6=Sáb (igual que Date#getDay). */
export const WEEKDAYS = [
  { id: 1, short: 'Lun', label: 'Lunes' },
  { id: 2, short: 'Mar', label: 'Martes' },
  { id: 3, short: 'Mié', label: 'Miércoles' },
  { id: 4, short: 'Jue', label: 'Jueves' },
  { id: 5, short: 'Vie', label: 'Viernes' },
  { id: 6, short: 'Sáb', label: 'Sábado' },
  { id: 0, short: 'Dom', label: 'Domingo' },
]

/**
 * Promos de pago organizadas por día.
 * days: null = siempre; array = días de la semana (0=Dom … 6=Sáb).
 */
export const PAYMENT_PROMOS = [
  {
    id: 'none',
    label: 'Sin promo',
    store: null,
    percent: 0,
    short: 'Lista',
    days: null,
    payment: '',
    note: 'Total con el precio cargado de cada producto, sin descuento de medio de pago.',
  },
  {
    id: 'mp-carrefour',
    label: 'Mercado Pago · Carrefour',
    store: 'carrefour',
    percent: 15,
    short: 'MP Carrefour',
    days: [4],
    payment: 'Dinero en cuenta',
    note: 'Jueves · 15% pagando con dinero en cuenta de Mercado Pago (QR). Solo productos con precio Carrefour.',
  },
  {
    id: 'visa-nfc-coto',
    label: 'Visa Débito NFC · Coto',
    store: 'coto',
    percent: 30,
    short: 'Visa NFC',
    days: [4],
    payment: 'Visa Débito NFC',
    note: 'Jueves · 30% con Visa Débito NFC. No aplica si ya tiene descuento web en Coto, ni electro/patios/bodegas.',
  },
  {
    id: 'mp-coto-vie',
    label: 'Mercado Pago · Coto',
    store: 'coto',
    percent: 25,
    short: 'MP Coto',
    days: [5],
    payment: 'Mercado Pago',
    note: 'Viernes · 25% con Mercado Pago. No aplica si el producto ya tiene descuento web en Coto.',
  },
  {
    id: 'mp-coto-finde',
    label: 'Mercado Pago · Coto',
    store: 'coto',
    percent: 20,
    short: 'MP Coto',
    days: [6, 0],
    payment: 'Mercado Pago',
    note: 'Sábado/Domingo · 20% con Mercado Pago. No aplica si el producto ya tiene descuento web en Coto.',
  },
]

export function todayWeekday(date = new Date()) {
  return date.getDay()
}

export function weekdayLabel(day) {
  return WEEKDAYS.find((entry) => entry.id === day)?.label || ''
}

export function promosForDay(day) {
  return PAYMENT_PROMOS.filter(
    (promo) => promo.id === 'none' || !promo.days || promo.days.includes(day),
  )
}

export function defaultPromoIdForDay(day) {
  const options = promosForDay(day).filter((promo) => promo.id !== 'none')
  if (!options.length) return 'none'
  return [...options].sort((a, b) => b.percent - a.percent)[0].id
}

export function storeUnitPrice(item, store) {
  if (!item || !store) return 0
  if (store === 'coto') {
    const coto = Number(item.priceCoto)
    if (Number.isFinite(coto) && coto > 0) return coto
    if (item.priceSource === 'coto') {
      const price = Number(item.price)
      return Number.isFinite(price) && price > 0 ? price : 0
    }
    return 0
  }
  if (store === 'carrefour') {
    const carrefour = Number(item.priceCarrefour)
    if (Number.isFinite(carrefour) && carrefour > 0) return carrefour
    if (item.priceSource === 'carrefour') {
      const price = Number(item.price)
      return Number.isFinite(price) && price > 0 ? price : 0
    }
    return 0
  }
  return 0
}

export function webDiscountLabel(item, store) {
  if (!item) return ''
  if (store === 'coto') return String(item.discountCoto || '').trim()
  if (store === 'carrefour') return String(item.discountCarrefour || '').trim()
  if (item.priceSource === 'coto') return String(item.discountCoto || '').trim()
  if (item.priceSource === 'carrefour') return String(item.discountCarrefour || '').trim()
  return String(item.discountCoto || item.discountCarrefour || '').trim()
}

export function hasWebDiscount(item, store) {
  return Boolean(webDiscountLabel(item, store))
}

export function isVisaNfcCotoExcluded(item) {
  const hay = fold(`${item?.name || ''} ${item?.category || ''} ${item?.brand || ''}`)
  return VISA_NFC_COTO_EXCLUSIONS.some((key) => hay.includes(key))
}

function exclusionReason(promo, item, unitPrice) {
  if (!promo.store) return ''
  if (!unitPrice) {
    return promo.store === 'coto' ? 'Sin precio en Coto' : 'Sin precio en Carrefour'
  }
  // En Coto las promos de pago no se acumulan con descuento web del producto
  if (promo.store === 'coto' && hasWebDiscount(item, 'coto')) {
    return 'Ya tiene descuento web en Coto'
  }
  if (promo.id === 'visa-nfc-coto' && isVisaNfcCotoExcluded(item)) {
    return 'Excluido de Visa NFC'
  }
  if (item?.priceSource === 'custom' && !storeUnitPrice(item, promo.store)) {
    return 'Precio personalizado'
  }
  return ''
}

/**
 * Calcula elegibles / no elegibles y totales para una promo de pago.
 * @param {Array<{ id: string, item: object, need: number, unitPrice?: number, lineTotal?: number }>} cartLines
 * @param {typeof PAYMENT_PROMOS[number]} promo
 */
export function quoteCartPromo(cartLines, promo) {
  const selected = PAYMENT_PROMOS.find((entry) => entry.id === promo?.id) || PAYMENT_PROMOS[0]
  const eligible = []
  const excluded = []

  for (const line of cartLines || []) {
    const need = Number(line.need) || 0
    if (need <= 0) continue
    const webStore = selected.store || line.item?.priceSource
    const webDiscount = webDiscountLabel(line.item, webStore)

    if (!selected.store || selected.percent <= 0) {
      const unitPrice = Number(line.unitPrice) || Number(line.item?.price) || 0
      const lineTotal = unitPrice * need
      eligible.push({
        ...line,
        unitPrice,
        lineTotal,
        discount: 0,
        payable: lineTotal,
        eligible: true,
        reason: '',
        webDiscount,
      })
      continue
    }

    const unitPrice = storeUnitPrice(line.item, selected.store)
    const lineTotal = unitPrice * need
    const reason = exclusionReason(selected, line.item, unitPrice)
    if (reason || !unitPrice) {
      const fallbackUnit = Number(line.unitPrice) || Number(line.item?.price) || 0
      const fallbackTotal = fallbackUnit * need
      excluded.push({
        ...line,
        unitPrice: unitPrice || fallbackUnit,
        lineTotal: unitPrice ? lineTotal : fallbackTotal,
        discount: 0,
        payable: unitPrice ? lineTotal : fallbackTotal,
        eligible: false,
        reason: reason || 'Sin precio del super',
        webDiscount,
      })
      continue
    }

    const discount = (lineTotal * selected.percent) / 100
    eligible.push({
      ...line,
      unitPrice,
      lineTotal,
      discount,
      payable: Math.max(0, lineTotal - discount),
      eligible: true,
      reason: '',
      webDiscount,
    })
  }

  const sum = (list, key) => list.reduce((acc, row) => acc + (Number(row[key]) || 0), 0)
  const eligibleSubtotal = sum(eligible, 'lineTotal')
  const excludedSubtotal = sum(excluded, 'lineTotal')
  const discountTotal = sum(eligible, 'discount')
  const payableEligible = sum(eligible, 'payable')
  const payableExcluded = sum(excluded, 'payable')
  const withWebOffer = [...eligible, ...excluded].filter((row) => row.webDiscount).length

  return {
    promo: selected,
    eligible,
    excluded,
    eligibleSubtotal,
    excludedSubtotal,
    discountTotal,
    subtotal: eligibleSubtotal + excludedSubtotal,
    payable: payableEligible + payableExcluded,
    withWebOffer,
  }
}
