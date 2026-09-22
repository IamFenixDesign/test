function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Heurísticas de exclusiones típicas de Visa Débito NFC / rubros bancarios en Coto. */
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

/** Exclusiones frecuentes en promos bancarias Carrefour (electro / carnicería). */
const CARREFOUR_BANK_EXCLUSIONS = [
  'electro',
  'heladera',
  'lavarropa',
  'notebook',
  'televisor',
  'smart tv',
  'celular',
  'telefon',
  'carnicer',
  'vacuna',
  'pollo',
  'cerdo',
  'embutido',
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
 * Promos de pago en sucursales (presencial), organizadas por día.
 * days: null = siempre; array = días de la semana (0=Dom … 6=Sáb).
 * channel: 'presencial' = solo locales físicos.
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
    channel: 'presencial',
    note: 'Total con el precio cargado de cada producto, sin descuento de medio de pago.',
  },

  // —— Coto · Lunes ——
  {
    id: 'coto-modo-ciudad-lun',
    label: 'MODO Ciudad · Coto',
    store: 'coto',
    percent: 25,
    short: 'MODO Ciudad',
    days: [1],
    payment: 'MODO QR · Visa/MC/Cabal Ciudad',
    channel: 'presencial',
    note: 'Lunes · 25% presencial con MODO (app Ciudad/Buepp). Tope aprox. $30.000. No aplica si ya tiene descuento web.',
  },
  {
    id: 'coto-anses',
    label: 'ANSES · Coto',
    store: 'coto',
    percent: 10,
    short: 'ANSES Coto',
    days: [1, 2, 3, 4],
    payment: 'Débito/crédito + DNI ANSES',
    channel: 'presencial',
    note: 'Lunes a jueves · 10% presencial para beneficiarios ANSES (presentar DNI). Sin tope. No aplica si ya tiene descuento web.',
  },

  // —— Coto · Martes ——
  {
    id: 'coto-modo-mar',
    label: 'MODO · Coto',
    store: 'coto',
    percent: 20,
    short: 'MODO Coto',
    days: [2],
    payment: 'MODO QR · bancos adheridos',
    channel: 'presencial',
    note: 'Martes · 20% presencial con MODO (Nación, Santander, Galicia, BBVA, Macro, etc.). Sin tope en productos alcanzados. No aplica si ya tiene descuento web.',
  },
  {
    id: 'coto-comunidad',
    label: 'Comunidad Coto',
    store: 'coto',
    percent: 15,
    short: 'Comunidad',
    days: [2, 3, 4],
    payment: 'Cualquier medio · DNI Comunidad',
    channel: 'presencial',
    note: 'Martes a jueves · 15% presencial para miembros Comunidad Coto (DNI en caja). No acumulable con promos bancarias. No aplica si ya tiene descuento web.',
  },

  // —— Coto · Miércoles ——
  {
    id: 'coto-superapp-mie',
    label: 'SuperApp · Coto',
    store: 'coto',
    percent: 25,
    short: 'SuperApp',
    days: [3],
    payment: 'SuperApp Coto · cualquier medio',
    channel: 'presencial',
    note: 'Miércoles · 25% presencial pagando con SuperApp Coto. Sin tope. No válido online. No aplica si ya tiene descuento web.',
  },

  // —— Coto · Jueves ——
  {
    id: 'visa-nfc-coto',
    label: 'Visa Débito NFC · Coto',
    store: 'coto',
    percent: 30,
    short: 'Visa NFC',
    days: [4],
    payment: 'Visa Débito NFC (Apple/Google Pay)',
    channel: 'presencial',
    excludeVisaNfc: true,
    note: 'Jueves · 30% presencial con Visa Débito NFC. No QR. No aplica si ya tiene descuento web, ni electro/patios/bodegas.',
  },
  {
    id: 'coto-icbc-deb-jue',
    label: 'ICBC Visa Débito · Coto',
    store: 'coto',
    percent: 20,
    short: 'ICBC Coto',
    days: [4],
    payment: 'Visa Débito ICBC',
    channel: 'presencial',
    note: 'Jueves · 20% presencial con Visa Débito ICBC. Sin tope. No aplica si ya tiene descuento web.',
  },

  // —— Coto · Viernes / finde ——
  {
    id: 'mp-coto-vie',
    label: 'Mercado Pago · Coto',
    store: 'coto',
    percent: 25,
    short: 'MP Coto',
    days: [5],
    payment: 'Mercado Pago QR',
    channel: 'presencial',
    note: 'Viernes · 25% presencial con Mercado Pago (QR). Sin tope. No aplica si el producto ya tiene descuento web en Coto.',
  },
  {
    id: 'mp-coto-finde',
    label: 'Mercado Pago · Coto',
    store: 'coto',
    percent: 20,
    short: 'MP Coto',
    days: [6, 0],
    payment: 'Mercado Pago QR',
    channel: 'presencial',
    note: 'Sábado/Domingo · 20% presencial con Mercado Pago (QR). No aplica si el producto ya tiene descuento web en Coto.',
  },

  // —— Carrefour · Lunes ——
  {
    id: 'mp-carrefour-lun',
    label: 'Mercado Pago · Carrefour',
    store: 'carrefour',
    percent: 15,
    short: 'MP Carrefour',
    days: [1],
    payment: 'Crédito vía Mercado Pago QR',
    channel: 'presencial',
    excludeCarrefourBank: true,
    note: 'Lunes · 15% presencial con tarjeta de crédito vía Mercado Pago (QR). Tope aprox. $15.000/mes. No válido online.',
  },
  {
    id: 'carrefour-banco-maxi-lunmar',
    label: 'Carrefour Banco · Maxi',
    store: 'carrefour',
    percent: 15,
    short: 'CF Banco Maxi',
    days: [1, 2],
    payment: 'Tarjeta crédito Carrefour Banco',
    channel: 'presencial',
    excludeCarrefourBank: true,
    note: 'Lunes y martes · 15% presencial en Carrefour Maxi con tarjeta Carrefour Banco. Sin tope. Excluye electro y carnicería.',
  },
  {
    id: 'carrefour-anses',
    label: 'Mi Carrefour ANSES/60+',
    store: 'carrefour',
    percent: 10,
    short: 'ANSES CF',
    days: [1, 2, 3],
    payment: 'Débito o Mi Carrefour',
    channel: 'presencial',
    excludeCarrefourBank: true,
    note: 'Lunes a miércoles · 10% presencial si sos beneficiario ANSES o mayor de 60 (Mi Carrefour). Tope aprox. $35.000.',
  },

  // —— Carrefour · Martes ——
  {
    id: 'carrefour-banco-mar',
    label: 'Carrefour Banco · Carrefour',
    store: 'carrefour',
    percent: 20,
    short: 'CF Banco',
    days: [2],
    payment: 'Tarjeta crédito Carrefour Banco',
    channel: 'presencial',
    excludeCarrefourBank: true,
    note: 'Martes · 20% presencial en Hiper/Market/Express con Carrefour Banco (no Maxi). Sin tope. Excluye electro y carnicería.',
  },

  // —— Carrefour · Miércoles ——
  {
    id: 'carrefour-cuenta-dni-mie',
    label: 'Cuenta DNI · Carrefour',
    store: 'carrefour',
    percent: 10,
    short: 'Cuenta DNI',
    days: [3],
    payment: 'Cuenta DNI',
    channel: 'presencial',
    note: 'Miércoles · 10% presencial con Cuenta DNI en formatos adheridos. Sin tope (sujeto a compra mínima según vigencia).',
  },

  // —— Carrefour · Jueves ——
  {
    id: 'mp-carrefour',
    label: 'Mercado Pago · Carrefour',
    store: 'carrefour',
    percent: 15,
    short: 'MP Carrefour',
    days: [4],
    payment: 'Dinero en cuenta',
    channel: 'presencial',
    note: 'Jueves · 15% presencial pagando con dinero en cuenta de Mercado Pago (QR). Solo productos con precio Carrefour.',
  },

  // —— Carrefour · Viernes ——
  {
    id: 'mp-carrefour-maxi-vie',
    label: 'Mercado Pago · Carrefour Maxi',
    store: 'carrefour',
    percent: 10,
    short: 'MP Maxi',
    days: [5],
    payment: 'Dinero en cuenta',
    channel: 'presencial',
    excludeCarrefourBank: true,
    note: 'Viernes · 10% presencial en Carrefour Maxi con dinero en cuenta de Mercado Pago (QR). Sin tope. Excluye carnicería/electro/bazar.',
  },

  // —— Carrefour · Finde ——
  {
    id: 'carrefour-cuenta-digital-finde',
    label: 'Cuenta Digital Carrefour Banco',
    store: 'carrefour',
    percent: 10,
    short: 'CF Digital',
    days: [6, 0],
    payment: 'Cuenta Digital Carrefour Banco',
    channel: 'presencial',
    excludeCarrefourBank: true,
    note: 'Sábado/Domingo · 10% presencial con Cuenta Digital Carrefour Banco (Hiper/Market/Express). Sin tope. Excluye carnicería/electro.',
  },

  // —— Carrefour · Lun a Vie (menor %) ——
  {
    id: 'carrefour-nacion-modo',
    label: 'Banco Nación MODO · Carrefour',
    store: 'carrefour',
    percent: 5,
    short: 'Nación MODO',
    days: [1, 2, 3, 4, 5],
    payment: 'MODO · débito/crédito Nación',
    channel: 'presencial',
    excludeCarrefourBank: true,
    note: 'Lunes a viernes · 5% presencial con MODO Banco Nación (jubilados/pensionados según vigencia). Tope semanal aprox. $5.000.',
  },

  // —— Día · Martes ——
  {
    id: 'dia-naranja-x-mar',
    label: 'Naranja X · Día',
    store: 'dia',
    percent: 30,
    short: 'Naranja X',
    days: [2],
    payment: 'Naranja X · Plan Épico',
    channel: 'presencial',
    note: 'Martes · 30% presencial con Naranja X (Plan Épico). Tope semanal aprox. $12.000.',
  },

  // —— Día · Miércoles ——
  {
    id: 'mp-dia-mie',
    label: 'Mercado Pago · Día',
    store: 'dia',
    percent: 15,
    short: 'MP Día',
    days: [3],
    payment: 'Mercado Pago QR',
    channel: 'presencial',
    note: 'Miércoles · 15% presencial con Mercado Pago (QR). Compra mínima aprox. $20.000. Sin tope de reintegro.',
  },

  // —— Día · Viernes / sábado ——
  {
    id: 'dia-galicia-viesab',
    label: 'Galicia · Día',
    store: 'dia',
    percent: 20,
    short: 'Galicia Día',
    days: [5, 6],
    payment: 'Galicia · débito/crédito o QR',
    channel: 'presencial',
    note: 'Viernes y sábado · 20% presencial con Galicia. Compra mínima aprox. $35.000. Tope mensual aprox. $20.000.',
  },

  // —— Día · Lun a Vie (menor %) ——
  {
    id: 'dia-nacion-lunvie',
    label: 'Banco Nación · Día',
    store: 'dia',
    percent: 5,
    short: 'Nación Día',
    days: [1, 2, 3, 4, 5],
    payment: 'Débito/crédito Nación o MODO',
    channel: 'presencial',
    note: 'Lunes a viernes · 5% presencial con Banco Nación. Tope semanal aprox. $5.000.',
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
  if (store === 'dia') {
    const dia = Number(item.priceDia)
    if (Number.isFinite(dia) && dia > 0) return dia
    if (item.priceSource === 'dia') {
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
  if (store === 'dia') return String(item.discountDia || '').trim()
  if (item.priceSource === 'coto') return String(item.discountCoto || '').trim()
  if (item.priceSource === 'carrefour') return String(item.discountCarrefour || '').trim()
  if (item.priceSource === 'dia') return String(item.discountDia || '').trim()
  return String(item.discountCoto || item.discountCarrefour || item.discountDia || '').trim()
}

export function hasWebDiscount(item, store) {
  return Boolean(webDiscountLabel(item, store))
}

export function isVisaNfcCotoExcluded(item) {
  const hay = fold(`${item?.name || ''} ${item?.category || ''} ${item?.brand || ''}`)
  return VISA_NFC_COTO_EXCLUSIONS.some((key) => hay.includes(key))
}

export function isCarrefourBankExcluded(item) {
  const hay = fold(`${item?.name || ''} ${item?.category || ''} ${item?.brand || ''}`)
  return CARREFOUR_BANK_EXCLUSIONS.some((key) => hay.includes(key))
}

function storeLabel(store) {
  if (store === 'coto') return 'Coto'
  if (store === 'carrefour') return 'Carrefour'
  if (store === 'dia') return 'Día'
  return 'el súper'
}

function exclusionReason(promo, item, unitPrice) {
  if (!promo.store) return ''
  if (!unitPrice) {
    return `Sin precio en ${storeLabel(promo.store)}`
  }
  // En Coto las promos de pago no se acumulan con descuento web del producto
  if (promo.store === 'coto' && hasWebDiscount(item, 'coto')) {
    return 'Ya tiene descuento web en Coto'
  }
  if ((promo.id === 'visa-nfc-coto' || promo.excludeVisaNfc) && isVisaNfcCotoExcluded(item)) {
    return 'Excluido de Visa NFC'
  }
  if (promo.excludeCarrefourBank && isCarrefourBankExcluded(item)) {
    return 'Excluido de promo bancaria'
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
