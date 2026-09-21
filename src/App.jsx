import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { barcodeDigits, extractEan13, guessCategory, matchByEan, searchSupermarkets } from './supermarkets'
import {
  PAYMENT_PROMOS,
  WEEKDAYS,
  promosForDay,
  quoteCartPromo,
  todayWeekday,
  weekdayLabel,
} from './discounts'
import { deleteRemoteItem, fetchRemoteItems, upsertRemoteItem } from './itemsApi'
import { changePassword, fetchMe, logout as logoutRequest, updateProfile as saveProfile } from './auth'
import { getCameraStream, releaseCameraStream } from './camera'
import Login from './Login.jsx'

const STORAGE_KEY = 'stockly-items-v2'
const THEME_KEY = 'stockly-theme'
const CATEGORIES = ['Alimentos', 'Bebidas', 'Limpieza', 'Papelería', 'Insumos']
const FILTER_CATEGORIES = ['Todo', ...CATEGORIES]
const SYNC_MS = 2500
const DIRTY_MS = 2500
const syncChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('stockly-inventory') : null

function inventoryFingerprint(list) {
  return list
    .map((item) =>
      [item.id, item.name, item.quantity, item.minStock, item.price, item.category, item.barcode].join(':'),
    )
    .sort()
    .join('|')
}

const emptyForm = {
  name: '',
  barcode: '',
  category: 'Alimentos',
  quantity: 1,
  minStock: 5,
  price: '',
  priceSource: '',
  priceCoto: '',
  priceCarrefour: '',
  urlCoto: '',
  urlCarrefour: '',
  image: '',
  imageCoto: '',
  imageCarrefour: '',
  discountCoto: '',
  discountCarrefour: '',
}

function loadItems(userId) {
  try {
    const keys = userId ? [`${STORAGE_KEY}:${userId}`, STORAGE_KEY] : [STORAGE_KEY]
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(normalizeItemCounts)
    }
  } catch {
    /* ignore corrupt storage */
  }
  return []
}

function loadLegacyItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeItemCounts) : []
  } catch {
    return []
  }
}

function normalizeItemCounts(item) {
  if (!item || typeof item !== 'object') return item
  return {
    ...item,
    quantity: toCount(item.quantity),
    minStock: toCount(item.minStock),
  }
}

function writeLocalItems(userId, list) {
  if (!userId) return
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(list))
  } catch {
    /* ignore quota / private mode */
  }
}

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return 'dark'
}

function money(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function barcodeOf(item) {
  return String(item?.barcode || item?.ean || item?.sku || '').trim()
}

function normalizeProductName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function eanOf(item) {
  return barcodeDigits(barcodeOf(item) || item?.barcode || '')
}

function findDuplicate(list, incoming, exceptId) {
  const ean = eanOf(incoming)
  const name = normalizeProductName(incoming.name)
  return list.find((item) => {
    if (exceptId && item.id === exceptId) return false
    const itemEan = eanOf(item)
    if (ean && itemEan) return ean === itemEan
    return Boolean(name) && name === normalizeProductName(item.name)
  })
}

function mergeItemRecords(base, incoming) {
  const extraQty = Number(incoming.quantity)
  return {
    ...base,
    id: base.id,
    name: String(incoming.name || base.name || '').trim() || base.name,
    barcode: barcodeOf(incoming) || barcodeOf(base),
    category: incoming.category || base.category,
    quantity: Number(base.quantity || 0) + (Number.isFinite(extraQty) ? extraQty : 0),
    minStock: Math.max(Number(base.minStock || 0), Number(incoming.minStock || 0)),
    price: incoming.price || base.price,
    priceSource: incoming.priceSource || base.priceSource,
    priceCoto: incoming.priceCoto || base.priceCoto,
    priceCarrefour: incoming.priceCarrefour || base.priceCarrefour,
    urlCoto: incoming.urlCoto || base.urlCoto,
    urlCarrefour: incoming.urlCarrefour || base.urlCarrefour,
    image: incoming.image || base.image,
    imageCoto: incoming.imageCoto || base.imageCoto,
    imageCarrefour: incoming.imageCarrefour || base.imageCarrefour,
    discountCoto: incoming.discountCoto || base.discountCoto || '',
    discountCarrefour: incoming.discountCarrefour || base.discountCarrefour || '',
  }
}

function coalesceDuplicates(list) {
  const kept = []
  const removedIds = []
  const absorbedIds = new Set()
  for (const item of list) {
    const dup = findDuplicate(kept, item)
    if (!dup) {
      kept.push(item)
      continue
    }
    const index = kept.findIndex((entry) => entry.id === dup.id)
    kept[index] = mergeItemRecords(dup, item)
    absorbedIds.add(dup.id)
    if (item.id !== dup.id) removedIds.push(item.id)
  }
  return { kept, removedIds, absorbedIds }
}

function productImage(item) {
  if (!item) return ''
  if (item.priceSource === 'coto') return item.imageCoto || item.image || ''
  if (item.priceSource === 'carrefour') return item.imageCarrefour || item.image || ''
  return item.image || item.imageCoto || item.imageCarrefour || ''
}

function toCount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function statusOf(item) {
  const quantity = toCount(item?.quantity)
  const minStock = toCount(item?.minStock)
  if (quantity <= 0) return 'out'
  // Igual al mínimo = en stock; solo por debajo = stock bajo
  if (quantity < minStock) return 'low'
  return 'ok'
}

/** Unidades faltantes para llegar al stock mínimo (0 si ya está en mínimo o más). */
function neededToMin(item) {
  const quantity = toCount(item?.quantity)
  const minStock = toCount(item?.minStock)
  return Math.max(0, minStock - quantity)
}

function shouldAutoCart(item) {
  const status = statusOf(item)
  return (status === 'low' || status === 'out') && neededToMin(item) > 0
}

function statusLabel(status) {
  if (status === 'out') return 'Sin stock'
  if (status === 'low') return 'Stock bajo'
  return 'En stock'
}

function IconMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.1 21.2 8 12 12.9 2.8 8 12 3.1Z" />
      <path d="M2.8 8 12 12.9V21L2.8 16.1V8Z" opacity="0.55" />
      <path d="M21.2 8 12 12.9V21l9.2-4.9V8Z" opacity="0.38" />
    </svg>
  )
}

function IconBox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8.5 12 4l9 4.5v9L12 22 3 17.5v-9Z" />
      <path d="M12 4v18M3 8.5l9 4.5 9-4.5" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

function MenuSelect({ id, value, options, onChange, openMenu, setOpenMenu, full = false, align = 'left', drop = 'down' }) {
  const open = openMenu === id
  const selected = options.find((option) => option.value === value) || options[0]

  return (
    <div className={`menu-select ${full ? 'full' : ''} ${open ? 'open' : ''}`} data-menu={id}>
        <button
          type="button"
        className="menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpenMenu(open ? null : id)}
      >
        <span>{selected.label}</span>
        <Chevron />
        </button>
      {open && (
        <ul className={`menu-list ${align === 'right' ? 'right' : ''} ${drop === 'up' ? 'up' : ''}`} role="listbox">
          {options.map((option) => {
            const active = option.value === value
            return (
              <li key={option.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={active ? 'active' : ''}
                  onClick={() => {
                    onChange(option.value)
                    setOpenMenu(null)
                  }}
                >
                  <span>{option.label}</span>
                  {active && <Check />}
                </button>
            </li>
            )
          })}
          </ul>
      )}
        </div>
  )
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.8 12H2.6M21.4 12h-2.2M6.2 6.2 4.6 4.6M19.4 19.4l-1.6-1.6M6.2 17.8 4.6 19.4M19.4 4.6l-1.6 1.6" />
          </svg>
  )
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />
                </svg>
  )
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h11" />
      <path d="m8 8-4 4 4 4" />
                </svg>
  )
}

function IconScan() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M5 12h14" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function IconTorch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10h10l-1.2 10.2a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8L7 10Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4" />
      <path d="M12 2v2" />
    </svg>
  )
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H7" />
    </svg>
  )
}

function ItemThumb({ item }) {
  const src = productImage(item)
  if (src) return <img className="item-thumb" src={src} alt="" />
  return (
    <span className="item-thumb placeholder" aria-hidden="true">
      <IconBox />
    </span>
  )
}

function BarcodeScanner({ stream, onDetect, onCancel }) {
  const videoRef = useRef(null)
  const viewRef = useRef(null)
  const onDetectRef = useRef(onDetect)
  const streamRef = useRef(stream)
  const [message, setMessage] = useState('Alejá o acercá el código: lo leemos de lejos')
  const [live, setLive] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [detectedEan, setDetectedEan] = useState('')
  const [hitBox, setHitBox] = useState(null)
  onDetectRef.current = onDetect
  streamRef.current = stream

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return undefined

    let timer = 0
    let confirmTimer = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const work = document.createElement('canvas')
    const workCtx = work.getContext('2d', { willReadFrequently: true })

    const SCAN_PASSES = [
      { w: 0.98, h: 0.58, scale: 1 },
      { w: 0.78, h: 0.4, scale: 1.15 },
      { w: 0.52, h: 0.28, scale: 1.7 },
      { w: 0.36, h: 0.2, scale: 2.35 },
      { w: 0.26, h: 0.15, scale: 3 },
    ]

    function mapVideoRectToView(sx, sy, sw, sh) {
      const view = viewRef.current
      if (!view || !video.videoWidth || !video.videoHeight) return null
      const rect = view.getBoundingClientRect()
      const vw = video.videoWidth
      const vh = video.videoHeight
      const scale = Math.max(rect.width / vw, rect.height / vh)
      const displayW = vw * scale
      const displayH = vh * scale
      const offsetX = (rect.width - displayW) / 2
      const offsetY = (rect.height - displayH) / 2
      const pad = 8
      return {
        left: offsetX + sx * scale - pad,
        top: offsetY + sy * scale - pad,
        width: sw * scale + pad * 2,
        height: sh * scale + pad * 2,
      }
    }

    function boxFromDetector(code, crop) {
      const bb = code?.boundingBox
      if (bb && Number.isFinite(bb.x) && Number.isFinite(bb.width)) {
        return mapVideoRectToView(
          crop.sx + bb.x / crop.scale,
          crop.sy + bb.y / crop.scale,
          bb.width / crop.scale,
          bb.height / crop.scale,
        )
      }
      const corners = code?.cornerPoints
      if (Array.isArray(corners) && corners.length >= 2) {
        const xs = corners.map((p) => p.x)
        const ys = corners.map((p) => p.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        return mapVideoRectToView(
          crop.sx + minX / crop.scale,
          crop.sy + minY / crop.scale,
          (maxX - minX) / crop.scale,
          (maxY - minY) / crop.scale,
        )
      }
      return mapVideoRectToView(crop.sx, crop.sy, crop.cropW, crop.cropH)
    }

    function boxFromZxing(result, crop) {
      const points = result?.getResultPoints?.() || []
      if (points.length >= 2) {
        const xs = points.map((p) => p.getX())
        const ys = points.map((p) => p.getY())
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        const padX = Math.max(12, (maxX - minX) * 0.08)
        const padY = Math.max(10, (maxY - minY) * 0.45)
        return mapVideoRectToView(
          crop.sx + (minX - padX) / crop.scale,
          crop.sy + (minY - padY) / crop.scale,
          (maxX - minX + padX * 2) / crop.scale,
          (maxY - minY + padY * 2) / crop.scale,
        )
      }
      return mapVideoRectToView(crop.sx, crop.sy, crop.cropW, crop.cropH)
    }

    function accept(ean, box) {
      if (stopped || !ean) return false
      if (box) setHitBox(box)
      setDetectedEan(ean)
      setMessage(`EAN ${ean} detectado`)
      stopped = true
      confirmTimer = window.setTimeout(() => {
        onDetectRef.current(ean)
      }, 220)
      return true
    }

    function tryValue(value, box) {
      const ean = extractEan13(value)
      if (!ean) return false
      return accept(ean, box)
    }

    function lockVideoBox() {
      video.removeAttribute('width')
      video.removeAttribute('height')
      video.style.position = 'absolute'
      video.style.inset = '0'
      video.style.width = '100%'
      video.style.height = '100%'
      video.style.minWidth = '100%'
      video.style.minHeight = '100%'
      video.style.maxWidth = 'none'
      video.style.objectFit = 'cover'
      video.style.objectPosition = 'center'
      video.style.transform = 'translateZ(0)'
    }

    function grabPass(mode) {
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh || !ctx || !workCtx) return null
      const cropW = Math.max(220, Math.floor(vw * mode.w))
      const cropH = Math.max(100, Math.floor(vh * mode.h))
      const sx = Math.floor((vw - cropW) / 2)
      const sy = Math.max(0, Math.floor((vh - cropH) / 2 - vh * 0.04))
      const outW = Math.min(1600, Math.floor(cropW * mode.scale))
      const outH = Math.min(900, Math.floor(cropH * mode.scale))
      canvas.width = outW
      canvas.height = outH
      ctx.imageSmoothingEnabled = mode.scale > 1.2
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH)

      let contrast = canvas
      if (mode.scale >= 1.5 && workCtx) {
        work.width = outW
        work.height = outH
        workCtx.drawImage(canvas, 0, 0)
        try {
          const image = workCtx.getImageData(0, 0, outW, outH)
          const data = image.data
          for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
            const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.4 + 128))
            data[i] = boosted
            data[i + 1] = boosted
            data[i + 2] = boosted
          }
          workCtx.putImageData(image, 0, 0)
          contrast = work
        } catch {
          contrast = canvas
        }
      }

      return {
        canvas,
        contrast,
        sx,
        sy,
        cropW,
        cropH,
        scale: mode.scale,
      }
    }

    function waitForFrame() {
      return new Promise((resolve) => {
        let tries = 0
        const check = () => {
          if (stopped) {
            resolve()
            return
          }
          if (video.videoWidth > 32 && video.videoHeight > 32) {
            resolve()
            return
          }
          tries += 1
          if (tries > 45) {
            resolve()
            return
          }
          requestAnimationFrame(check)
        }
        const kick = () => requestAnimationFrame(check)
        video.addEventListener('loadedmetadata', kick, { once: true })
        video.addEventListener('loadeddata', kick, { once: true })
        video.addEventListener('playing', kick, { once: true })
        kick()
      })
    }

    async function start() {
      try {
        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.muted = true
        video.playsInline = true
        video.autoplay = true
        lockVideoBox()
        video.srcObject = stream
        lockVideoBox()
        try {
          await video.play()
        } catch {
          /* autoplay can wait for the first frame */
        }
        await waitForFrame()
        lockVideoBox()
        if (stopped) return
        setLive(true)
        setMessage('Alejá el teléfono: buscamos el código a mayor distancia')

        const track = stream.getVideoTracks()[0]
        const caps = track?.getCapabilities?.() || {}
        if (caps.torch) setHasTorch(true)

        const preferred = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar']
        let detector = null
        const Detector = window.BarcodeDetector
        if (typeof Detector === 'function') {
          let formats = preferred
          if (typeof Detector.getSupportedFormats === 'function') {
            const supported = await Detector.getSupportedFormats()
            formats = preferred.filter((format) => supported.includes(format))
          }
          detector = new Detector({ formats: formats.length ? formats : preferred })
        }

        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const { BarcodeFormat, DecodeHintType } = await import('@zxing/library')
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 20 })

        let pass = 0
        const formatRank = (format) => {
          const name = String(format || '').toLowerCase()
          if (name.includes('ean_13') || name.includes('ean13')) return 0
          if (name.includes('upc_a') || name.includes('upca')) return 1
          if (name.includes('ean')) return 2
          return 3
        }

        const tick = async () => {
          if (stopped) return
          try {
            if (video.readyState >= 2) {
              const mode = SCAN_PASSES[pass % SCAN_PASSES.length]
              const crop = grabPass(mode)
              if (crop) {
                if (detector) {
                  const codes = await detector.detect(crop.canvas)
                  const ranked = [...codes].sort(
                    (a, b) => formatRank(a.format) - formatRank(b.format),
                  )
                  for (const code of ranked) {
                    const box = boxFromDetector(code, crop)
                    if (tryValue(code?.rawValue, box)) return
                  }
                }
                const sources =
                  crop.contrast === crop.canvas ? [crop.canvas] : [crop.contrast, crop.canvas]
                for (const source of sources) {
                  try {
                    const result = reader.decodeFromCanvas(source)
                    const text = result?.getText?.()
                    if (text) {
                      const box = boxFromZxing(result, crop)
                      if (tryValue(text, box)) return
                    }
                  } catch {
                    /* frame without a readable code */
                  }
                }
              }
            }
          } catch {
            /* skip unreadable frame */
          }
          if (stopped) return
          pass += 1
          timer = window.setTimeout(tick, 28)
        }
        tick()
      } catch (err) {
        if (stopped) return
        setLive(false)
        if (err?.name === 'NotAllowedError') {
          setMessage('Habilitá la cámara para escanear el código.')
        } else if (err?.name === 'NotFoundError') {
          setMessage('No encontramos una cámara.')
        } else {
          setMessage('No se pudo abrir la cámara.')
        }
      }
    }

    start()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.clearTimeout(confirmTimer)
      try {
        video.pause()
      } catch {
        /* ignore */
      }
      video.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch {
      setHasTorch(false)
    }
  }

  return (
    <div className={`scanner-screen ${live ? 'is-live' : ''} ${detectedEan ? 'is-ean' : ''}`}>
      <div className="scanner-topbar">
        {hasTorch ? (
          <button
            className={`scanner-torch ${torchOn ? 'on' : ''}`}
            type="button"
            onClick={toggleTorch}
            aria-label={torchOn ? 'Apagar linterna' : 'Prender linterna'}
          >
            <IconTorch />
          </button>
        ) : (
          <span className="scanner-top-spacer" />
        )}
        <strong>{detectedEan ? 'EAN detectado' : 'Escanear código'}</strong>
        <button className="scanner-close" type="button" onClick={onCancel} aria-label="Cerrar cámara">
          <IconClose />
        </button>
      </div>
      <div className="scanner-view" ref={viewRef}>
        <video ref={videoRef} autoPlay muted playsInline disablePictureInPicture />
        {hitBox ? (
          <div
            className={`scanner-hit-box ${detectedEan ? 'locked' : ''}`}
            style={{
              left: `${hitBox.left}px`,
              top: `${hitBox.top}px`,
              width: `${Math.max(hitBox.width, 48)}px`,
              height: `${Math.max(hitBox.height, 28)}px`,
            }}
            aria-hidden="true"
          >
            {detectedEan ? <span className="scanner-ean-badge">EAN {detectedEan}</span> : null}
          </div>
        ) : null}
        <div className="scanner-overlay" aria-hidden="true">
          <div className={`scanner-window ${detectedEan ? 'is-ean' : ''}`}>
            <span className="scanner-corner tl" />
            <span className="scanner-corner tr" />
            <span className="scanner-corner bl" />
            <span className="scanner-corner br" />
            <span className="scanner-laser" />
          </div>
        </div>
      </div>
      <div className="scanner-dock">
        <span className={`scanner-pulse ${detectedEan ? 'ok' : ''}`} aria-hidden="true" />
        <p>{message}</p>
        <button className="scanner-cancel" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function StoreResult({ product, onPick }) {
  return (
    <button className={`store-result ${product.store}`} type="button" onClick={() => onPick(product)}>
      {product.image ? <img src={product.image} alt="" /> : <span className="store-thumb" />}
      <span>
        <strong>{product.name}</strong>
        <em>
          {product.ean ? `${product.ean} · ` : ''}
          {product.brand ? `${product.brand} · ` : ''}
          {money(product.price)}
          {product.hasDiscount && product.discountLabel ? ` · ${product.discountLabel}` : ''}
        </em>
        {product.hasDiscount ? (
          <span className="store-offer-tag">Con descuento web</span>
        ) : (
          <span className="store-offer-tag muted">Sin descuento web</span>
        )}
      </span>
    </button>
  )
}

function ItemPrice({ item }) {
  const offer =
    item.priceSource === 'coto'
      ? item.discountCoto
      : item.priceSource === 'carrefour'
        ? item.discountCarrefour
        : item.discountCoto || item.discountCarrefour
  return (
    <div className="price-cell">
      <div className="price-static">
        <strong>{money(item.price)}</strong>
        {offer ? <span className="price-offer">{offer}</span> : null}
      </div>
    </div>
  )
}

function ItemActions({ item, onEdit, onRemove }) {
  return (
    <div className="row-actions">
      <button className="icon-btn" type="button" title="Editar" aria-label={`Editar ${item.name}`} onClick={onEdit}>
        <IconEdit />
      </button>
      <button className="icon-btn danger" type="button" title="Eliminar" aria-label={`Eliminar ${item.name}`} onClick={onRemove}>
        <IconTrash />
      </button>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState(loadTheme)
  const [user, setUser] = useState(undefined)
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [category, setCategory] = useState('Todo')
  const [modal, setModal] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [openMenu, setOpenMenu] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [passwordModal, setPasswordModal] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [profileModal, setProfileModal] = useState(false)
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', email: '' })
  const [profileError, setProfileError] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [storeQuery, setStoreQuery] = useState('')
  const [storeResults, setStoreResults] = useState({ coto: [], carrefour: [], errors: {} })
  const [storeTab, setStoreTab] = useState('coto')
  const [storeLoading, setStoreLoading] = useState(false)
  const [storeError, setStoreError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [cartBusy, setCartBusy] = useState(false)
  const [cartRemoved, setCartRemoved] = useState(() => new Set())
  const [cartDay, setCartDay] = useState(() => todayWeekday())
  const [cartPromoId, setCartPromoId] = useState('none')
  const [allowCustomPrice, setAllowCustomPrice] = useState(false)
  const itemsRef = useRef(items)
  const searchInputRef = useRef(null)
  const storeResultsRef = useRef(null)
  const customPriceRef = useRef(null)
  const qtySyncRef = useRef({})
  const deletedIdsRef = useRef(new Set())
  const dirtyIdsRef = useRef(new Map())
  const lastAutoRefreshRef = useRef(0)
  const refreshStorePricesRef = useRef(async () => {})
  itemsRef.current = items

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!hydrated || !user?.id) return
    writeLocalItems(user.id, items)
  }, [items, hydrated, user])

  useEffect(() => {
    let cancelled = false
    fetchMe().then((current) => {
      if (!cancelled) setUser(current)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setItems([])
      setHydrated(false)
      lastAutoRefreshRef.current = 0
      return undefined
    }
    let cancelled = false
    async function hydrate() {
      const remote = await fetchRemoteItems()
      if (cancelled) return
      const notDeleted = (item) => !deletedIdsRef.current.has(item.id)
      if (Array.isArray(remote)) {
        const alive = remote.filter(notDeleted)
        if (alive.length > 0) {
          const { kept, removedIds, absorbedIds } = coalesceDuplicates(alive)
          setItems(kept)
          removedIds.forEach((id) => {
            deletedIdsRef.current.add(id)
            deleteRemoteItem(id)
          })
          absorbedIds.forEach((id) => {
            const item = kept.find((entry) => entry.id === id)
            if (item) persistItem(item)
          })
        } else {
          const legacy = loadLegacyItems().filter(notDeleted)
          if (legacy.length && !loadItems(user.id).length) {
            await Promise.all(legacy.map((item) => upsertRemoteItem(item)))
            if (cancelled) return
            setItems(legacy)
            try {
              localStorage.removeItem(STORAGE_KEY)
            } catch {
              /* ignore */
            }
          } else {
            setItems([])
          }
        }
      } else {
        setItems(loadItems(user.id).filter(notDeleted))
      }
      setHydrated(true)
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!hydrated || !user?.id) return undefined
    let cancelled = false

    function mergeRemote(remote) {
      const now = Date.now()
      const dirty = dirtyIdsRef.current
      const alive = remote.filter((item) => !deletedIdsRef.current.has(item.id))
      const remoteIds = new Set(alive.map((item) => item.id))
      const localById = new Map(itemsRef.current.map((item) => [item.id, item]))
      const next = alive.map((item) => {
        const dirtyAt = dirty.get(item.id)
        if (dirtyAt && now - dirtyAt < DIRTY_MS) {
          return localById.get(item.id) || item
        }
        dirty.delete(item.id)
        return item
      })
      for (const [id, dirtyAt] of dirty) {
        if (remoteIds.has(id) || deletedIdsRef.current.has(id)) continue
        if (now - dirtyAt >= DIRTY_MS) continue
        const local = localById.get(id)
        if (local) next.unshift(local)
      }
      const { kept, removedIds, absorbedIds } = coalesceDuplicates(next)
      for (const id of removedIds) {
        deletedIdsRef.current.add(id)
        deleteRemoteItem(id)
      }
      if (absorbedIds.size) {
        kept.forEach((item) => {
          if (absorbedIds.has(item.id)) persistItem(item)
        })
      }
      if (inventoryFingerprint(kept) === inventoryFingerprint(itemsRef.current)) return
      itemsRef.current = kept
      setItems(kept)
    }

    async function pullRemote() {
      if (cancelled || document.visibilityState === 'hidden') return
      const remote = await fetchRemoteItems()
      if (cancelled || !Array.isArray(remote)) return
      mergeRemote(remote)
    }

    function onBroadcast(event) {
      if (event.data?.type === 'deleted' && event.data.id) {
        deletedIdsRef.current.add(event.data.id)
        setItems((prev) => {
          const next = prev.filter((item) => item.id !== event.data.id)
          itemsRef.current = next
          return next
        })
      }
      pullRemote()
    }

    pullRemote()
    const timer = window.setInterval(pullRemote, SYNC_MS)
    window.addEventListener('focus', pullRemote)
    document.addEventListener('visibilitychange', pullRemote)
    syncChannel?.addEventListener('message', onBroadcast)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', pullRemote)
      document.removeEventListener('visibilitychange', pullRemote)
      syncChannel?.removeEventListener('message', onBroadcast)
    }
  }, [hydrated, user?.id])

  useEffect(() => {
    if (!hydrated || !user?.id) return undefined
    let cancelled = false

    async function refreshAll() {
      const now = Date.now()
      if (lastAutoRefreshRef.current && now - lastAutoRefreshRef.current < 10 * 60 * 1000) return
      lastAutoRefreshRef.current = now
      const list = itemsRef.current
      for (const item of list) {
        if (cancelled) return
        await refreshStorePricesRef.current(item, { silent: true })
      }
    }

    refreshAll()
    function onVisible() {
      if (document.visibilityState === 'visible') refreshAll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [hydrated, user?.id])

  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!pendingDelete || deleteBusy) return undefined
    function onKey(event) {
      if (event.key === 'Escape') setPendingDelete(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingDelete, deleteBusy])

  useEffect(() => {
    if (!pendingDelete?.id || deleteBusy) return
    if (!items.some((item) => item.id === pendingDelete.id)) {
      setPendingDelete(null)
    }
  }, [items, pendingDelete, deleteBusy])

  useEffect(() => {
    if (!openMenu) return undefined
    function onPointerDown(event) {
      if (event.target.closest('[data-menu]')) return
      setOpenMenu(null)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        barcodeOf(item).toLowerCase().includes(q)
      return matchesQuery && (category === 'Todo' || item.category === category)
    })
  }, [items, query, category])

  const groupedItems = useMemo(() => {
    const buckets = Object.fromEntries(CATEGORIES.map((entry) => [entry, []]))
    for (const item of filtered) {
      const key = CATEGORIES.includes(item.category) ? item.category : 'Alimentos'
      buckets[key].push(item)
    }
    const order = category === 'Todo' ? CATEGORIES : [category]
    return order
      .map((entry) => ({ category: entry, items: buckets[entry] || [] }))
      .filter((group) => group.items.length > 0)
  }, [filtered, category])

  const stats = useMemo(() => {
    const units = items.reduce((sum, item) => sum + item.quantity, 0)
    const low = items.filter((item) => statusOf(item) === 'low').length
    const out = items.filter((item) => statusOf(item) === 'out').length
    return { units, low, out }
  }, [items])

  const cartLines = useMemo(() => {
    return items
      .filter((item) => shouldAutoCart(item) && !cartRemoved.has(item.id))
      .map((item) => {
        const need = neededToMin(item)
        const unitPrice = Number(item.price) || 0
        return {
          id: item.id,
          item,
          need,
          have: toCount(item.quantity),
          min: toCount(item.minStock),
          unitPrice,
          lineTotal: unitPrice * need,
        }
      })
  }, [items, cartRemoved])

  const cartTotals = useMemo(() => {
    const units = cartLines.reduce((sum, line) => sum + line.need, 0)
    const total = cartLines.reduce((sum, line) => sum + line.lineTotal, 0)
    return { units, total, count: cartLines.length }
  }, [cartLines])

  const cartDayPromos = useMemo(() => {
    const list = promosForDay(cartDay).filter((promo) => promo.id !== 'none')
    return [...list].sort((a, b) => {
      if (a.store !== b.store) {
        if (a.store === 'coto') return -1
        if (b.store === 'coto') return 1
        if (a.store === 'carrefour') return -1
        if (b.store === 'carrefour') return 1
      }
      return b.percent - a.percent
    })
  }, [cartDay])

  const cartPromoGroups = useMemo(() => {
    const coto = cartDayPromos.filter((promo) => promo.store === 'coto')
    const carrefour = cartDayPromos.filter((promo) => promo.store === 'carrefour')
    return { coto, carrefour }
  }, [cartDayPromos])

  const cartQuote = useMemo(() => {
    const available = promosForDay(cartDay)
    const promo =
      available.find((entry) => entry.id === cartPromoId) ||
      available.find((entry) => entry.id === 'none') ||
      PAYMENT_PROMOS[0]
    return quoteCartPromo(cartLines, promo)
  }, [cartLines, cartPromoId, cartDay])

  const cartDisplayLines = useMemo(() => {
    return [...cartQuote.eligible, ...cartQuote.excluded]
  }, [cartQuote])

  function selectCartDay(day) {
    setCartDay(day)
    setCartPromoId('none')
  }

  function toggleCartPromo(promoId) {
    setCartPromoId((current) => (current === promoId ? 'none' : promoId))
  }

  function renderPromoOption(promo) {
    const active = cartPromoId === promo.id
    return (
      <button
        key={promo.id}
        type="button"
        role="checkbox"
        aria-checked={active}
        className={`cart-deal ${active ? 'active' : ''} store-${promo.store}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          toggleCartPromo(promo.id)
        }}
      >
        <span className="cart-deal-pct">-{promo.percent}%</span>
        <span className="cart-deal-copy">
          <strong>{promo.short}</strong>
          <span>{promo.payment || 'Medio de pago'}</span>
        </span>
        <span className="cart-deal-check" aria-hidden="true" />
      </button>
    )
  }

  useEffect(() => {
    if (!cartRemoved.size) return
    const liveIds = new Set(items.map((item) => item.id))
    setCartRemoved((prev) => {
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (!liveIds.has(id)) {
          changed = true
          continue
        }
        const item = items.find((entry) => entry.id === id)
        if (!item || !shouldAutoCart(item)) {
          changed = true
          continue
        }
        next.add(id)
      }
      return changed ? next : prev
    })
  }, [items, cartRemoved.size])

  function showToast(message) {
    if (window.matchMedia('(max-width: 760px)').matches) return
    setToast(message)
  }

  function closeScanner() {
    setScanning(false)
    setCameraStream((current) => {
      releaseCameraStream(current)
      return null
    })
  }

  async function openScanner() {
    setStoreError('')
    try {
      const stream = await getCameraStream()
      setCameraStream(stream)
      setScanning(true)
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setStoreError('Permití el uso de la cámara. Si la bloqueaste, activala en Ajustes del teléfono.')
      } else if (err?.name === 'NotFoundError') {
        setStoreError('No encontramos una cámara.')
      } else {
        setStoreError('No se pudo abrir la cámara.')
      }
    }
  }

  async function handleLogout() {
    await logoutRequest()
    setOpenMenu(null)
    setModal(null)
    setPendingDelete(null)
    setPasswordModal(false)
    closeScanner()
    setCartOpen(false)
    setCartRemoved(new Set())
    setHydrated(false)
    deletedIdsRef.current = new Set()
    dirtyIdsRef.current = new Map()
    setItems([])
    setUser(null)
  }

  function openPasswordModal() {
    setOpenMenu(null)
    setPasswordError('')
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordModal(true)
  }

  function openProfileModal() {
    setOpenMenu(null)
    setProfileError('')
    setProfileForm({
      firstName: user.firstName || user.name?.split(' ')[0] || '',
      lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || '',
      email: user.email || '',
    })
    setProfileModal(true)
  }

  function toggleGroup(name) {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  async function handleSaveProfile(event) {
    event.preventDefault()
    setProfileBusy(true)
    setProfileError('')
    try {
      const next = await saveProfile(profileForm)
      setUser(next)
      setProfileModal(false)
      showToast('Perfil actualizado')
    } catch (err) {
      setProfileError(err?.message || 'No se pudo guardar el perfil')
    } finally {
      setProfileBusy(false)
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Las contraseñas no coinciden')
      return
    }
    setPasswordBusy(true)
    setPasswordError('')
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordModal(false)
      showToast('Contraseña actualizada')
    } catch (err) {
      setPasswordError(err?.message || 'No se pudo cambiar la contraseña')
    } finally {
      setPasswordBusy(false)
    }
  }

  function persistItem(item) {
    if (!item?.id || deletedIdsRef.current.has(item.id)) return
    dirtyIdsRef.current.set(item.id, Date.now())
    upsertRemoteItem(item)
  }

  function updateQty(id, next) {
    const quantity = Math.max(0, next)
    dirtyIdsRef.current.set(id, Date.now())
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity } : item)))
    clearTimeout(qtySyncRef.current[id])
    qtySyncRef.current[id] = setTimeout(() => {
      const item = itemsRef.current.find((entry) => entry.id === id)
      if (item) persistItem(item)
    }, 450)
  }

  function removeFromCart(id) {
    setCartRemoved((prev) => new Set(prev).add(id))
  }

  function applyCartPurchases() {
    if (!cartLines.length || cartBusy) return
    setCartBusy(true)
    const bumps = new Map(cartLines.map((line) => [line.id, line.need]))
    setItems((prev) =>
      prev.map((item) => {
        const need = bumps.get(item.id)
        if (!need) return item
        return { ...item, quantity: toCount(item.quantity) + need }
      }),
    )
    for (const line of cartLines) {
      dirtyIdsRef.current.set(line.id, Date.now())
      clearTimeout(qtySyncRef.current[line.id])
      qtySyncRef.current[line.id] = setTimeout(() => {
        const item = itemsRef.current.find((entry) => entry.id === line.id)
        if (item) persistItem(item)
      }, 450)
    }
    setCartRemoved(new Set())
    setCartOpen(false)
    setCartBusy(false)
    showToast(
      cartLines.length === 1
        ? 'Compra aplicada al stock'
        : `${cartLines.length} productos actualizados en el stock`,
    )
  }

  function applyFormStorePrice(store) {
    const value = store === 'coto' ? Number(form.priceCoto) : Number(form.priceCarrefour)
    if (!value) return
    setForm((prev) => ({
      ...prev,
      price: String(value),
      priceSource: store,
      image: store === 'coto' ? prev.imageCoto || prev.image : prev.imageCarrefour || prev.image,
    }))
    setAllowCustomPrice(false)
    setError('')
  }

  function clearStoreProduct() {
    setForm((prev) => ({
      ...prev,
      barcode: '',
      price: '',
      priceSource: '',
      priceCoto: '',
      priceCarrefour: '',
      urlCoto: '',
      urlCarrefour: '',
      image: '',
      imageCoto: '',
      imageCarrefour: '',
      discountCoto: '',
      discountCarrefour: '',
    }))
    setStoreQuery(form.name)
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreError('')
    setAllowCustomPrice(false)
    setError('')
    showToast('Producto quitado de la búsqueda')
  }

  function openNewItem() {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setStoreQuery('')
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreTab('coto')
    setStoreError('')
    setAllowCustomPrice(false)
    setOpenMenu(null)
    closeScanner()
    setModal('item')
  }

  function openEditItem(item) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      barcode: barcodeOf(item),
      category: item.category,
      quantity: item.quantity,
      minStock: item.minStock,
      price: item.price ? String(item.price) : '',
      priceSource: item.priceSource || '',
      priceCoto: item.priceCoto ? String(item.priceCoto) : '',
      priceCarrefour: item.priceCarrefour ? String(item.priceCarrefour) : '',
      urlCoto: item.urlCoto || '',
      urlCarrefour: item.urlCarrefour || '',
      image: item.image || '',
      imageCoto: item.imageCoto || '',
      imageCarrefour: item.imageCarrefour || '',
      discountCoto: item.discountCoto || '',
      discountCarrefour: item.discountCarrefour || '',
    })
    setError('')
    setStoreQuery('')
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreTab('coto')
    setStoreError('')
    setAllowCustomPrice(item.priceSource === 'custom')
    setOpenMenu(null)
    closeScanner()
    setModal('item')
  }

  function closeItemModal() {
    closeScanner()
    setEditingId(null)
    setModal(null)
  }

  function applyStoreProduct(product) {
    const otherKey = product.store === 'coto' ? 'carrefour' : 'coto'
    const match = matchByEan(product, storeResults[otherKey] || [])
    const coto = product.store === 'coto' ? product : match
    const carrefour = product.store === 'carrefour' ? product : match
    setForm((prev) => ({
      ...prev,
      name: product.name,
      barcode: product.ean || prev.barcode,
      category: guessCategory(product),
      price: String(product.price),
      priceSource: product.store,
      priceCoto: coto ? String(coto.price) : prev.priceCoto,
      priceCarrefour: carrefour ? String(carrefour.price) : prev.priceCarrefour,
      urlCoto: coto?.url || prev.urlCoto,
      urlCarrefour: carrefour?.url || prev.urlCarrefour,
      image: product.image || prev.image,
      imageCoto: coto?.image || prev.imageCoto,
      imageCarrefour: carrefour?.image || prev.imageCarrefour,
      discountCoto: coto
        ? coto.hasDiscount
          ? coto.discountLabel || 'Oferta'
          : ''
        : prev.discountCoto,
      discountCarrefour: carrefour
        ? carrefour.hasDiscount
          ? carrefour.discountLabel || 'Oferta'
          : ''
        : prev.discountCarrefour,
    }))
    setStoreQuery('')
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreError('')
    setAllowCustomPrice(false)
    setError('')
    showToast(
      product.ean
        ? `Código ${product.ean} detectado`
        : `Precio de ${product.store === 'coto' ? 'Coto' : 'Carrefour'} aplicado`,
    )
  }

  function enableCustomPrice() {
    setAllowCustomPrice(true)
    setStoreError('')
    setError('')
    setForm((prev) => ({
      ...prev,
      priceSource: prev.priceSource === 'coto' || prev.priceSource === 'carrefour' ? 'custom' : prev.priceSource || 'custom',
      price: prev.priceSource === 'coto' || prev.priceSource === 'carrefour' ? '' : prev.price,
    }))
    requestAnimationFrame(() => {
      customPriceRef.current?.focus?.()
      customPriceRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    })
  }

  function handleCustomPriceChange(raw) {
    const next = String(raw || '').replace(/[^\d.,]/g, '')
    setForm((prev) => ({ ...prev, price: next, priceSource: 'custom' }))
    setAllowCustomPrice(true)
    setError('')
  }

  function handleScannedCode(raw) {
    const ean = extractEan13(raw)
    if (!ean) return
    closeScanner()
    setStoreQuery(ean)
    setForm((prev) => ({ ...prev, barcode: ean }))
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreError('')
    setStoreTab('coto')
    setAllowCustomPrice(false)
    showToast(`EAN ${ean} cargado · buscando…`)
    lookupStores(ean)
  }

  async function lookupStores(term) {
    const q = (term || storeQuery || form.barcode || form.name).trim()
    if (!q) {
      setStoreError('Escribí un producto o EAN y tocá Enter.')
      return
    }
    setStoreQuery(q)
    setStoreLoading(true)
    setStoreError('')
    try {
      const data = await searchSupermarkets(q)
      setStoreResults(data)
      const prefer =
        data.coto.length > 0 ? 'coto' : data.carrefour.length > 0 ? 'carrefour' : 'coto'
      setStoreTab(prefer)
      if (!data.coto.length && !data.carrefour.length) {
        setAllowCustomPrice(true)
        setStoreError('No está en Coto ni Carrefour. Podés cargar un precio personalizado.')
        requestAnimationFrame(() => {
          customPriceRef.current?.focus?.()
          customPriceRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
        })
      } else {
        setAllowCustomPrice(false)
      }
      requestAnimationFrame(() => {
        storeResultsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    } catch {
      setAllowCustomPrice(true)
      setStoreError('No se pudieron consultar Coto y Carrefour. Podés cargar un precio personalizado.')
    } finally {
      setStoreLoading(false)
    }
  }

  async function refreshStorePrices(item, { silent = false } = {}) {
    if (!item?.id || deletedIdsRef.current.has(item.id)) return
    const code = barcodeOf(item)
    try {
      const data = await searchSupermarkets(code || item.name)
      const pick = (list) => (code && list.find((entry) => entry.ean === code)) || list[0] || null
      const coto = pick(data.coto)
      const carrefour = pick(data.carrefour)
      if (!coto && !carrefour) {
        if (!silent) showToast('No se encontraron precios en Coto ni Carrefour')
        return
      }
      const detected = coto?.ean || carrefour?.ean || ''
      setItems((prev) => {
        if (deletedIdsRef.current.has(item.id) || !prev.some((entry) => entry.id === item.id)) {
          return prev
        }
        const next = prev.map((entry) => {
          if (entry.id !== item.id) return entry
          const nextCoto = coto?.price ?? entry.priceCoto
          const nextCarrefour = carrefour?.price ?? entry.priceCarrefour
          const source = entry.priceSource
          const nextPrice =
            source === 'coto' && nextCoto
              ? nextCoto
              : source === 'carrefour' && nextCarrefour
                ? nextCarrefour
                : entry.price
          return {
            ...entry,
            price: nextPrice,
            priceCoto: nextCoto,
            priceCarrefour: nextCarrefour,
            urlCoto: coto?.url ?? entry.urlCoto,
            urlCarrefour: carrefour?.url ?? entry.urlCarrefour,
            barcode: barcodeOf(entry) || detected,
            imageCoto: coto?.image || entry.imageCoto,
            imageCarrefour: carrefour?.image || entry.imageCarrefour,
            discountCoto: coto
              ? coto.hasDiscount
                ? coto.discountLabel || 'Oferta'
                : ''
              : entry.discountCoto || '',
            discountCarrefour: carrefour
              ? carrefour.hasDiscount
                ? carrefour.discountLabel || 'Oferta'
                : ''
              : entry.discountCarrefour || '',
            image:
              source === 'coto'
                ? coto?.image || entry.imageCoto || entry.image
                : source === 'carrefour'
                  ? carrefour?.image || entry.imageCarrefour || entry.image
                  : coto?.image || carrefour?.image || entry.image,
          }
        })
        const saved = next.find((entry) => entry.id === item.id)
        if (saved) persistItem(saved)
        return next
      })
      if (!silent) showToast(`Precios de ${item.name} actualizados`)
    } catch {
      if (!silent) showToast('No se pudieron consultar los supermercados')
    }
  }
  refreshStorePricesRef.current = refreshStorePrices

  function saveItem(event) {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    const quantity = Number(form.quantity)
    const minStock = Number(form.minStock)
    const price = Number(String(form.price || '').replace(',', '.'))
    const source = form.priceSource
    const sourceOk = source === 'coto' || source === 'carrefour' || source === 'custom'
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('La cantidad no es válida.')
      return
    }
    if (!sourceOk || !Number.isFinite(price) || price <= 0) {
      setError(
        allowCustomPrice || source === 'custom'
          ? 'Ingresá un precio personalizado válido.'
          : 'Elegí un precio de Coto/Carrefour o cargá uno personalizado si no está.',
      )
      return
    }

    const imageCoto = form.imageCoto || ''
    const imageCarrefour = form.imageCarrefour || ''
    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      category: form.category,
      quantity,
      minStock: Number.isFinite(minStock) ? minStock : 0,
      price,
      priceSource: source,
      priceCoto: Number(form.priceCoto) || 0,
      priceCarrefour: Number(form.priceCarrefour) || 0,
      urlCoto: form.urlCoto,
      urlCarrefour: form.urlCarrefour,
      imageCoto,
      imageCarrefour,
      discountCoto: source === 'custom' ? '' : form.discountCoto || '',
      discountCarrefour: source === 'custom' ? '' : form.discountCarrefour || '',
      image:
        source === 'coto'
          ? imageCoto || form.image
          : source === 'carrefour'
            ? imageCarrefour || form.image
            : form.image || imageCoto || imageCarrefour,
    }

    if (editingId) {
      const other = findDuplicate(itemsRef.current, payload, editingId)
      if (other) {
        const merged = mergeItemRecords(other, payload)
        deletedIdsRef.current.add(editingId)
        const next = itemsRef.current
          .filter((entry) => entry.id !== editingId)
          .map((entry) => (entry.id === other.id ? merged : entry))
        itemsRef.current = next
        setItems(next)
        persistItem(merged)
        deleteRemoteItem(editingId)
        setCategory(merged.category)
        closeItemModal()
        setOpenMenu(null)
        showToast(`${merged.name}: se unificó con el ítem existente`)
        return
      }
      const saved = { id: editingId, ...payload }
      setItems((prev) => prev.map((entry) => (entry.id === editingId ? { ...entry, ...payload } : entry)))
      persistItem(saved)
      setCategory(payload.category)
      closeItemModal()
      setOpenMenu(null)
      showToast(`${payload.name} actualizado`)
      return
    }

    const existing = findDuplicate(itemsRef.current, payload)
    if (existing) {
      const merged = mergeItemRecords(existing, payload)
      const next = itemsRef.current.map((entry) => (entry.id === existing.id ? merged : entry))
      itemsRef.current = next
      setItems(next)
      persistItem(merged)
      setCategory(merged.category)
      closeItemModal()
      setOpenMenu(null)
      showToast(`${merged.name}: se sumó al stock existente`)
      return
    }

    const item = { id: crypto.randomUUID(), ...payload }
    setItems((prev) => [item, ...prev])
    dirtyIdsRef.current.set(item.id, Date.now())
    persistItem(item)
    setCategory(item.category)
    closeItemModal()
    setOpenMenu(null)
    showToast(`${item.name} se agregó al inventario`)
  }

  function askRemoveItem(item) {
    if (!item?.id) return
    setOpenMenu(null)
    setPendingDelete(item)
  }

  async function confirmRemoveItem() {
    const item = pendingDelete
    if (!item?.id || deleteBusy) return
    setDeleteBusy(true)
    try {
      await removeItem(item.id)
      setPendingDelete(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function removeItem(id) {
    const snapshot = itemsRef.current
    const item = snapshot.find((entry) => entry.id === id)
    if (!item) return
    deletedIdsRef.current.add(id)
    clearTimeout(qtySyncRef.current[id])
    const next = snapshot.filter((entry) => entry.id !== id)
    itemsRef.current = next
    setItems(next)
    writeLocalItems(user?.id, next)
    const ok = await deleteRemoteItem(id)
    if (!ok) {
      deletedIdsRef.current.delete(id)
      itemsRef.current = snapshot
      setItems(snapshot)
      writeLocalItems(user?.id, snapshot)
      showToast('No se pudo eliminar en el servidor')
      return
    }
    try {
      syncChannel?.postMessage({ type: 'deleted', id })
    } catch {
      /* ignore */
    }
    showToast(`${item.name || 'Ítem'} eliminado`)
  }

  if (user === undefined) {
  return (
      <div className="boot-screen" aria-busy="true" aria-label="Cargando">
        <div className="boot-logo">
          <IconMark />
        </div>
        </div>
    )
  }

  if (!user) {
    return <Login theme={theme} setTheme={setTheme} onLoggedIn={setUser} />
  }

  return (
    <div className={`app ${modal || scanning || passwordModal || profileModal || pendingDelete || cartOpen ? 'is-overlay' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <h1>Stockea</h1>
        </div>
        <div className="top-actions">
          <button
            className={`btn btn-ghost cart-toggle ${cartTotals.count ? 'has-items' : ''}`}
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={
              cartTotals.count
                ? `Carrito de compras, ${cartTotals.count} productos`
                : 'Carrito de compras'
            }
          >
            <IconCart />
            {cartTotals.count > 0 ? <span className="cart-badge">{cartTotals.count}</span> : null}
          </button>
          <div className="user-chip" data-menu="user">
        <button
              className="user-btn"
          type="button"
              aria-label="Cuenta"
              onClick={() => setOpenMenu(openMenu === 'user' ? null : 'user')}
            >
              {user.picture ? (
                <img src={user.picture} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{(user.name || user.email || 'S').slice(0, 1)}</span>
              )}
        </button>
            {openMenu === 'user' && (
              <div className="user-menu">
                <div className="user-menu-info">
                  <strong>{user.name || 'Cuenta'}</strong>
                  {user.email ? <span>{user.email}</span> : null}
                </div>
                <button className="user-action" type="button" onClick={openProfileModal}>
                  Editar perfil
                </button>
                <button className="user-action" type="button" onClick={openPasswordModal}>
                  Cambiar contraseña
                </button>
                <button className="user-logout" type="button" onClick={handleLogout}>
                  <IconLogout />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-ghost theme-toggle"
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button
            className="btn btn-primary btn-new-item"
            type="button"
            onClick={openNewItem}
            aria-label="Nuevo ítem"
          >
            <span className="new-item-plus" aria-hidden="true">+</span>
            <span className="new-item-label">Nuevo ítem</span>
          </button>
        </div>
      </header>

      <section className="kpis">
        <article className="kpi kpi-extra">
          <span>Productos</span>
          <strong>{items.length}</strong>
          <small>ítems activos</small>
        </article>
        <article className="kpi kpi-extra">
          <span>Unidades</span>
          <strong>{stats.units}</strong>
          <small>en inventario</small>
        </article>
        <article className={`kpi ${stats.low || stats.out ? 'warn' : ''}`}>
          <span>Alertas</span>
          <strong>{stats.low + stats.out}</strong>
          <small>{stats.out} sin stock</small>
        </article>
      </section>

      <section className="panel">
        <div className={`toolbar ${searchOpen ? 'is-searching' : ''}`}>
          <button
            className="search-toggle"
            type="button"
            aria-label="Buscar"
            onClick={() => {
              setSearchOpen(true)
              setOpenMenu(null)
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
          </svg>
          </button>
          <label className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
          </svg>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o EAN"
            />
            <button
              className="search-close"
              type="button"
              aria-label="Cerrar búsqueda"
              onClick={() => {
                setSearchOpen(false)
                setQuery('')
              }}
            >
              <IconClose />
            </button>
          </label>
          <MenuSelect
            id="filter-category"
            value={category}
            options={FILTER_CATEGORIES.map((entry) => ({
              value: entry,
              label: entry,
            }))}
            onChange={setCategory}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            full
          />
          <div className="category-tabs" role="tablist" aria-label="Categorías">
            {FILTER_CATEGORIES.map((entry) => {
              const active = category === entry
              return (
                <button
                  key={entry}
                  className={`category-tab ${active ? 'active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setCategory(entry)
                    setOpenMenu(null)
                  }}
                >
                  {entry}
                </button>
              )
            })}
        </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            {items.length === 0 ? (
              <>
                <h3>Sin productos</h3>
                <p>Agregá tu primer ítem para empezar a controlar el stock.</p>
              </>
            ) : (
              <>
                <h3>Sin productos en {category}</h3>
                <p>
                  {query.trim()
                    ? 'Probá con otro filtro o búsqueda.'
                    : category === 'Todo'
                      ? 'No hay ítems para mostrar.'
                      : `Esta categoría está vacía. Cambiá de categoría o agregá un ítem en ${category}.`}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio individual</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              {groupedItems.map((group) => {
                const closed = Boolean(collapsed[group.category])
                return (
                  <tbody key={group.category}>
                    <tr className="category-group-row">
                      <td colSpan={5}>
                        <button
                          className={`category-group-toggle ${closed ? 'is-collapsed' : ''}`}
                          type="button"
                          onClick={() => toggleGroup(group.category)}
                        >
                          <span>{group.category}</span>
                          <Chevron />
                        </button>
                      </td>
                    </tr>
                    {!closed &&
                      group.items.map((item) => {
                        const currentStatus = statusOf(item)
                        return (
                          <tr className="item-row" key={item.id}>
                            <td>
                              <div className="item-cell">
                                <ItemThumb item={item} />
                                <div>
                                  <span className="item-name">{item.name}</span>
                                  <span className="sku">{barcodeOf(item) || 'Sin código de barras'}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="qty">
                                <button type="button" onClick={() => updateQty(item.id, item.quantity - 1)} aria-label="Restar">
                                  −
                                </button>
                                <output>{item.quantity}</output>
                                <button type="button" onClick={() => updateQty(item.id, item.quantity + 1)} aria-label="Sumar">
                                  +
                                </button>
                              </div>
                            </td>
                            <td>
                              <ItemPrice item={item} />
                            </td>
                            <td>
                              <span className={`badge ${currentStatus}`}>{statusLabel(currentStatus)}</span>
                            </td>
                            <td>
                              <ItemActions
                                item={item}
                                onEdit={() => openEditItem(item)}
                                onRemove={() => askRemoveItem(item)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                )
              })}
            </table>
          </div>
          <div className="item-cards">
            {groupedItems.map((group) => {
              const closed = Boolean(collapsed[group.category])
              return (
                <section className="category-group" key={group.category}>
                  <button
                    className={`category-group-toggle ${closed ? 'is-collapsed' : ''}`}
                    type="button"
                    onClick={() => toggleGroup(group.category)}
                  >
                    <span>{group.category}</span>
                    <Chevron />
                  </button>
                  {!closed &&
                    group.items.map((item) => {
                      const currentStatus = statusOf(item)
                      return (
                        <article className="item-card" key={item.id}>
                          <div className="item-card-head">
                            <ItemThumb item={item} />
                            <div className="item-card-copy">
                              <span className="item-name">{item.name}</span>
                              <span className="sku">{barcodeOf(item) || 'Sin código de barras'}</span>
        </div>
                            <span className={`badge ${currentStatus}`}>{statusLabel(currentStatus)}</span>
                          </div>
                          <div className="item-card-meta">
                            <div className="qty">
                              <button type="button" onClick={() => updateQty(item.id, item.quantity - 1)} aria-label="Restar">
                                −
                              </button>
                              <output>{item.quantity}</output>
                              <button type="button" onClick={() => updateQty(item.id, item.quantity + 1)} aria-label="Sumar">
                                +
                              </button>
                            </div>
                            <ItemPrice item={item} />
                          </div>
                          <ItemActions
                            item={item}
                            onEdit={() => openEditItem(item)}
                            onRemove={() => askRemoveItem(item)}
                          />
                        </article>
                      )
                    })}
      </section>
              )
            })}
          </div>
          </>
        )}
      </section>

      {modal === 'item' && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) event.preventDefault()
          }}
        >
          <form className="modal wide item-sheet" onSubmit={saveItem}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <div>
                <h2>{editingId ? 'Editar ítem' : 'Nuevo ítem'}</h2>
                <p className="lead">
                  {editingId
                    ? 'Actualizá los datos o el precio de Coto o Carrefour.'
                    : 'Cargalo con el precio de Coto o Carrefour.'}
                </p>
              </div>
              <button className="icon-btn sheet-close" type="button" onClick={closeItemModal} aria-label="Cerrar">
                <IconClose />
              </button>
            </div>
            <div className="form-grid">
              <label className="field full">
                <span>Nombre</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Nombre del producto"
                />
              </label>
              <div className="field full store-search">
                <span>Buscar en Coto / Carrefour</span>
                <div className="store-lookup">
                  <input
                    type="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    value={storeQuery}
                    onChange={(event) => setStoreQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        lookupStores(event.currentTarget.value)
                      }
                    }}
                    placeholder="Nombre o EAN · Enter para buscar"
                  />
                  <button
                    className={`scan-btn ${scanning ? 'open' : ''}`}
                    type="button"
                    title="Escanear código de barras"
                    aria-label="Escanear código de barras"
                    onClick={() => {
                      openScanner()
                    }}
                    disabled={storeLoading}
                  >
                    <IconScan />
                  </button>
                </div>
                {(form.priceCoto || form.priceCarrefour || form.priceSource === 'custom') && (
                  <div className="store-selected">
                    <ItemThumb item={form} />
                    <div className="store-picked">
                      {form.priceCoto ? (
                        <button
                          className={`store-pill coto ${form.priceSource === 'coto' ? 'selected' : ''}`}
                          type="button"
                          onClick={() => applyFormStorePrice('coto')}
                        >
                          Coto {money(form.priceCoto)}
                          {form.discountCoto ? ` · ${form.discountCoto}` : ''}
                        </button>
                      ) : null}
                      {form.priceCarrefour ? (
                        <button
                          className={`store-pill carrefour ${form.priceSource === 'carrefour' ? 'selected' : ''}`}
                          type="button"
                          onClick={() => applyFormStorePrice('carrefour')}
                        >
                          Carrefour {money(form.priceCarrefour)}
                          {form.discountCarrefour ? ` · ${form.discountCarrefour}` : ''}
                        </button>
                      ) : null}
                      {form.priceSource === 'custom' && form.price ? (
                        <span className="store-pill custom selected">Personalizado {money(form.price)}</span>
                      ) : null}
                    </div>
                    <button className="btn btn-ghost btn-compact" type="button" onClick={clearStoreProduct}>
                      Quitar
                    </button>
                  </div>
                )}
                {storeLoading && <p className="hint">Buscando en Coto y Carrefour…</p>}
                {storeError && (
                  <div className="store-miss">
                    <p className="hint">{storeError}</p>
                    {allowCustomPrice ? (
                      <button className="btn btn-ghost btn-compact" type="button" onClick={enableCustomPrice}>
                        Precio personalizado
                      </button>
                    ) : null}
                  </div>
                )}
                {(storeResults.coto.length > 0 || storeResults.carrefour.length > 0) && (
                  <div className="store-results form-store-results" ref={storeResultsRef}>
                    <div className="store-result-tabs" role="tablist" aria-label="Supermercados">
                      {storeResults.coto.length > 0 ? (
                        <button
                          className={`store-result-tab coto ${storeTab === 'coto' ? 'active' : ''}`}
                          type="button"
                          role="tab"
                          aria-selected={storeTab === 'coto'}
                          onClick={() => setStoreTab('coto')}
                        >
                          Coto <small>{storeResults.coto.length}</small>
                        </button>
                      ) : null}
                      {storeResults.carrefour.length > 0 ? (
                        <button
                          className={`store-result-tab carrefour ${storeTab === 'carrefour' ? 'active' : ''}`}
                          type="button"
                          role="tab"
                          aria-selected={storeTab === 'carrefour'}
                          onClick={() => setStoreTab('carrefour')}
                        >
                          Carrefour <small>{storeResults.carrefour.length}</small>
                        </button>
                      ) : null}
                    </div>
                    <div className="store-cols">
                      {storeResults.coto.length > 0 ? (
                        <div className={`store-col ${storeTab === 'coto' ? 'is-open' : ''}`}>
                          <p className="store-col-title coto">Coto Digital</p>
                          {storeResults.coto.map((product) => (
                            <StoreResult key={product.ean || product.url} product={product} onPick={applyStoreProduct} />
                          ))}
                        </div>
                      ) : null}
                      {storeResults.carrefour.length > 0 ? (
                        <div className={`store-col ${storeTab === 'carrefour' ? 'is-open' : ''}`}>
                          <p className="store-col-title carrefour">Carrefour</p>
                          {storeResults.carrefour.map((product) => (
                            <StoreResult key={product.ean || product.url} product={product} onPick={applyStoreProduct} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              <label className="field">
                <span>Código de barras</span>
                <input
                  value={form.barcode}
                  onChange={(event) => setForm({ ...form, barcode: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      lookupStores(event.target.value)
                    }
                  }}
                  inputMode="numeric"
                  placeholder="EAN"
                />
              </label>
              <div className="field">
                <span>Categoría</span>
                <MenuSelect
                  id="form-category"
                  value={form.category}
                  options={CATEGORIES.map((entry) => ({ value: entry, label: entry }))}
                  onChange={(value) => setForm({ ...form, category: value })}
                  openMenu={openMenu}
                  setOpenMenu={setOpenMenu}
                  full
                  drop="up"
                />
              </div>
              <label className="field">
                <span>{editingId ? 'Cantidad' : 'Cantidad inicial'}</span>
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Stock mínimo</span>
                <input
                  type="number"
                  min="0"
                  value={form.minStock}
                  onChange={(event) => setForm({ ...form, minStock: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Precio</span>
                <div
                  className={`money-input ${
                    allowCustomPrice || form.priceSource === 'custom' ? 'is-custom' : 'locked'
                  }`}
                >
                  <span>$</span>
                  {allowCustomPrice || form.priceSource === 'custom' ? (
                    <input
                      ref={customPriceRef}
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoComplete="off"
                      value={form.price}
                      onChange={(event) => handleCustomPriceChange(event.target.value)}
                      placeholder="0,00"
                      aria-label="Precio personalizado"
                    />
                  ) : (
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={
                        form.price
                          ? Number(form.price).toLocaleString('es-AR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : ''
                      }
                      placeholder=""
                    />
                  )}
                </div>
                <small className="hint">
                  {allowCustomPrice || form.priceSource === 'custom'
                    ? 'Precio personalizado: el producto no está en Coto ni Carrefour, o lo cargaste a mano'
                    : 'Se completa con Coto o Carrefour; si no aparece, vas a poder poner uno personalizado'}
                </small>
              </label>
              {error && <p className="error">{error}</p>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={closeItemModal}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                {editingId ? 'Guardar cambios' : 'Agregar al stock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {scanning && cameraStream && (
        <BarcodeScanner stream={cameraStream} onDetect={handleScannedCode} onCancel={closeScanner} />
      )}

      {pendingDelete && (
        <div className="overlay overlay-dialog" role="presentation">
          <div className="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="sheet-handle" aria-hidden="true" />
            <h2 id="delete-title">¿Eliminar este producto?</h2>
            <p className="lead">
              {pendingDelete.name
                ? `Se va a quitar “${pendingDelete.name}” del inventario.`
                : 'Se va a quitar este ítem del inventario.'}
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleteBusy}
              >
                Cancelar
              </button>
              <button className="btn btn-danger" type="button" onClick={confirmRemoveItem} disabled={deleteBusy}>
                {deleteBusy ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cartOpen && (
        <div
          className="overlay overlay-dialog"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCartOpen(false)
          }}
        >
          <div className="modal cart-sheet" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <div>
                <h2 id="cart-title">Carrito de compras</h2>
                <p className="lead">
                  Solo lo faltante al mínimo. Calculá el total con descuentos de sucursal según el día.
                </p>
              </div>
              <button
                className="icon-btn sheet-close"
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Cerrar carrito"
              >
                <IconClose />
              </button>
            </div>

            {cartLines.length === 0 ? (
              <p className="cart-empty">No hay productos en stock bajo o sin stock para comprar.</p>
            ) : (
              <>
                <section className="cart-deals-panel" aria-label="Descuentos por día">
                  <div className="cart-deals-head">
                    <div>
                      <p className="cart-deals-kicker">Sucursales</p>
                      <h3 className="cart-deals-title">
                        {weekdayLabel(cartDay)}
                        {cartDay === todayWeekday() ? <span>hoy</span> : null}
                      </h3>
                    </div>
                    <p className="cart-deals-hint">Elegí día y medio de pago</p>
                  </div>

                  <div className="cart-days" role="tablist" aria-label="Día de la promo">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        role="tab"
                        aria-selected={cartDay === day.id}
                        className={`cart-day-chip ${cartDay === day.id ? 'active' : ''} ${
                          day.id === todayWeekday() ? 'is-today' : ''
                        }`}
                        onClick={() => selectCartDay(day.id)}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>

                  <div
                    key={cartDay}
                    className="cart-deals-body"
                    role="group"
                    aria-label="Descuentos de pago en sucursal"
                  >
                    {cartPromoGroups.coto.length > 0 ? (
                      <div className="cart-deals-group">
                        <p className="cart-deals-group-title store-coto">Coto</p>
                        <div className="cart-deals-list">{cartPromoGroups.coto.map(renderPromoOption)}</div>
                      </div>
                    ) : null}

                    {cartPromoGroups.carrefour.length > 0 ? (
                      <div className="cart-deals-group">
                        <p className="cart-deals-group-title store-carrefour">Carrefour</p>
                        <div className="cart-deals-list">
                          {cartPromoGroups.carrefour.map(renderPromoOption)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                <ul className="cart-list">
                  {cartDisplayLines.map((line) => (
                    <li
                      key={line.id}
                      className={`cart-line ${line.eligible ? 'is-eligible' : 'is-excluded'}`}
                    >
                      <ItemThumb item={line.item} />
                      <div className="cart-line-copy">
                        <strong>{line.item.name}</strong>
                        <span>
                          Tenés {line.have} · mínimo {line.min} · comprar {line.need}
                        </span>
                        <em>
                          {line.unitPrice
                            ? `${money(line.unitPrice)} c/u · ${money(line.lineTotal)}`
                            : 'Sin precio'}
                          {line.eligible && line.discount > 0
                            ? ` · ahorro ${money(line.discount)}`
                            : ''}
                        </em>
                        <div className="cart-line-tags">
                          <span className={`cart-web ${line.webDiscount ? 'yes' : 'no'}`}>
                            {line.webDiscount ? `Web: ${line.webDiscount}` : 'Web: sin dto'}
                          </span>
                          <span className={`cart-elig ${line.eligible ? 'yes' : 'no'}`}>
                            {line.eligible
                              ? cartQuote.promo.percent > 0
                                ? `Aplica ${cartQuote.promo.short}`
                                : 'Sin dto de pago'
                              : line.reason || 'No aplica'}
                          </span>
                        </div>
                      </div>
                      <div className="cart-line-side">
                        <output className="cart-qty" aria-label={`Comprar ${line.need}`}>
                          ×{line.need}
                        </output>
                        <button
                          className="icon-btn danger"
                          type="button"
                          title="Quitar del carrito"
                          aria-label={`Quitar ${line.item.name} del carrito`}
                          onClick={() => removeFromCart(line.id)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {(cartQuote.eligible.length > 0 || cartQuote.excluded.length > 0) &&
                cartQuote.promo.percent > 0 ? (
                  <div className="cart-split">
                    <span>
                      <strong>{cartQuote.eligible.length}</strong> con dto
                    </span>
                    <span>
                      <strong>{cartQuote.excluded.length}</strong> sin dto
                    </span>
                    <span>
                      <strong>{cartQuote.withWebOffer || 0}</strong> oferta web
                    </span>
                  </div>
                ) : cartLines.length > 0 ? (
                  <div className="cart-split">
                    <span>
                      <strong>{cartQuote.withWebOffer || 0}</strong> oferta web
                    </span>
                    <span>
                      <strong>
                        {Math.max(0, cartLines.length - (cartQuote.withWebOffer || 0))}
                      </strong>{' '}
                      sin oferta web
                    </span>
                  </div>
                ) : null}
              </>
            )}

            <div className="cart-summary">
              <p className="cart-summary-meta">
                {cartTotals.count} producto{cartTotals.count === 1 ? '' : 's'} · {cartTotals.units} u.
              </p>
              <div className="cart-summary-rows">
                <div>
                  <span>Subtotal (sin descuento de pago)</span>
                  <strong>{money(cartQuote.subtotal || cartTotals.total)}</strong>
                </div>
                <div className={cartQuote.discountTotal > 0 ? 'is-save' : ''}>
                  <span>
                    {cartQuote.promo.percent > 0
                      ? `Descuento ${cartQuote.promo.short}`
                      : 'Descuento de pago'}
                  </span>
                  <strong>
                    {cartQuote.discountTotal > 0 ? `-${money(cartQuote.discountTotal)}` : money(0)}
                  </strong>
                </div>
                <div className="is-pay">
                  <span>
                    {cartQuote.promo.percent > 0 ? 'Total con descuento' : 'Total de la compra'}
                  </span>
                  <strong>{money(cartQuote.payable || cartQuote.subtotal || cartTotals.total)}</strong>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setCartOpen(false)}>
                  Cerrar
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!cartLines.length || cartBusy}
                  onClick={applyCartPurchases}
                >
                  {cartBusy ? 'Aplicando…' : 'Marcar comprados'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {passwordModal && (
        <div className="overlay overlay-dialog">
          <form className="modal password-modal" onSubmit={handleChangePassword}>
            <h2>Cambiar contraseña</h2>
            <p className="lead">Ingresá tu contraseña actual y la nueva.</p>
            <label className="field full">
              <span>Contraseña actual</span>
              <input
                type="password"
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                required
              />
            </label>
            <label className="field full">
              <span>Contraseña nueva</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                minLength={8}
                required
              />
            </label>
            <label className="field full">
              <span>Repetir contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                minLength={8}
                required
              />
            </label>
            {passwordError ? <p className="error">{passwordError}</p> : null}
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setPasswordModal(false)} disabled={passwordBusy}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={passwordBusy}>
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {profileModal && (
        <div className="overlay overlay-dialog">
          <form className="modal password-modal" onSubmit={handleSaveProfile}>
            <h2>Editar perfil</h2>
            <p className="lead">Actualizá tu nombre, apellido y correo.</p>
            <label className="field full">
              <span>Nombre</span>
              <input
                value={profileForm.firstName}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))}
                autoComplete="given-name"
                required
              />
            </label>
            <label className="field full">
              <span>Apellido</span>
              <input
                value={profileForm.lastName}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, lastName: event.target.value }))}
                autoComplete="family-name"
                required
              />
            </label>
            <label className="field full">
              <span>Correo</span>
              <input
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                autoComplete="email"
                required
              />
            </label>
            {profileError ? <p className="error">{profileError}</p> : null}
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setProfileModal(false)} disabled={profileBusy}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={profileBusy}>
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <footer className="site-footer">
        <p>
          Created by{' '}
          <a href="https://github.com/IamFenixDesign" target="_blank" rel="noreferrer">
            Fenix
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
