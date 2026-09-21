import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { barcodeDigits, cheaperOf, guessCategory, isBarcode, matchByEan, searchSupermarkets } from './supermarkets'
import { deleteRemoteItem, fetchRemoteItems, upsertRemoteItem } from './itemsApi'
import { changePassword, fetchMe, logout as logoutRequest } from './auth'
import { getCameraStream } from './camera'
import Login from './Login.jsx'

const STORAGE_KEY = 'stockly-items-v2'
const THEME_KEY = 'stockly-theme'
const CATEGORIES = ['Alimentos', 'Bebidas', 'Limpieza', 'Papelería', 'Insumos']

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
}

function loadItems(userId) {
  try {
    const keys = userId ? [`${STORAGE_KEY}:${userId}`, STORAGE_KEY] : [STORAGE_KEY]
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* ignore corrupt storage */
  }
  return []
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

function productImage(item) {
  if (!item) return ''
  if (item.priceSource === 'coto') return item.imageCoto || item.image || ''
  if (item.priceSource === 'carrefour') return item.imageCarrefour || item.image || ''
  return item.image || item.imageCoto || item.imageCarrefour || ''
}

function statusOf(item) {
  if (item.quantity <= 0) return 'out'
  if (item.quantity <= item.minStock) return 'low'
  return 'ok'
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
  const onDetectRef = useRef(onDetect)
  const streamRef = useRef(stream)
  const [message, setMessage] = useState('Pasá el código de barras por el recuadro')
  const [live, setLive] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  onDetectRef.current = onDetect
  streamRef.current = stream

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return undefined

    let timer = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    function finish(value) {
      const code = String(value || '').replace(/\s/g, '')
      if (stopped || !code) return
      stopped = true
      onDetectRef.current(code)
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

    function grabFrame(wide = false) {
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh || !ctx) return null
      const cropW = Math.max(280, Math.floor(vw * (wide ? 0.96 : 0.86)))
      const cropH = Math.max(120, Math.floor(vh * (wide ? 0.42 : 0.28)))
      const sx = Math.floor((vw - cropW) / 2)
      const sy = Math.max(0, Math.floor((vh - cropH) / 2 - vh * 0.06))
      canvas.width = cropW
      canvas.height = cropH
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH)
      return canvas
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
        setMessage('Pasá el código por el recuadro')

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
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 40 })

        let pass = 0
        const tick = async () => {
          if (stopped) return
          try {
            if (video.readyState >= 2) {
              const frame = grabFrame(pass % 3 === 2)
              if (frame) {
                if (detector) {
                  const codes = await detector.detect(frame)
                  const raw = codes[0]?.rawValue
                  if (raw) {
                    finish(raw)
                    return
                  }
                }
                try {
                  const result = reader.decodeFromCanvas(frame)
                  const text = result?.getText?.()
                  if (text) {
                    finish(text)
                    return
                  }
                } catch {
                  /* frame without a readable code */
                }
              }
            }
          } catch {
            /* skip unreadable frame */
          }
          pass += 1
          timer = window.setTimeout(tick, 45)
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
      stream.getTracks().forEach((track) => track.stop())
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
    <div className={`scanner-screen ${live ? 'is-live' : ''}`}>
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
        <strong>Escanear código</strong>
        <button className="scanner-close" type="button" onClick={onCancel} aria-label="Cerrar cámara">
          <IconClose />
        </button>
        </div>
      <div className="scanner-view">
        <video ref={videoRef} autoPlay muted playsInline disablePictureInPicture />
        <div className="scanner-overlay" aria-hidden="true">
          <div className="scanner-window">
            <span className="scanner-corner tl" />
            <span className="scanner-corner tr" />
            <span className="scanner-corner bl" />
            <span className="scanner-corner br" />
            <span className="scanner-laser" />
          </div>
        </div>
      </div>
      <div className="scanner-dock">
        <span className="scanner-pulse" aria-hidden="true" />
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
        </em>
      </span>
    </button>
  )
}

function PricePicker({ item, open, onToggle, onPick }) {
  return (
    <div className="price-cell" data-menu={`price:${item.id}`}>
      <button className="price-btn" type="button" onClick={onToggle}>
        <strong>{money(item.price)}</strong>
        <span>
          {item.priceSource === 'coto'
            ? 'precio Coto'
            : item.priceSource === 'carrefour'
              ? 'precio Carrefour'
              : 'sin supermercado'}
        </span>
      </button>
      {open && (
        <div className="qty-menu store-choice">
          <p>Precio</p>
          {Number(item.priceCoto) > 0 || Number(item.priceCarrefour) > 0 ? (
            <div className="store-picked">
              {Number(item.priceCoto) > 0 && (
        <button
                  className={`store-pill coto ${item.priceSource === 'coto' ? 'selected' : ''}`}
          type="button"
                  onClick={() => onPick('coto')}
        >
                  Coto {money(item.priceCoto)}
        </button>
              )}
              {Number(item.priceCarrefour) > 0 && (
                <button
                  className={`store-pill carrefour ${item.priceSource === 'carrefour' ? 'selected' : ''}`}
                  type="button"
                  onClick={() => onPick('carrefour')}
                >
                  Carrefour {money(item.priceCarrefour)}
                </button>
              )}
            </div>
          ) : (
            <p>Buscá el producto en Coto o Carrefour para cargar el precio.</p>
          )}
        </div>
      )}
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

function SuperPrices({ item }) {
  const cheaper = cheaperOf(item.priceCoto, item.priceCarrefour)
  return (
    <div className="store-prices">
      {Number(item.priceCoto) > 0 ? (
        <a
          className={`store-pill coto ${cheaper === 'coto' ? 'cheaper' : ''}`}
          href={item.urlCoto || 'https://www.coto.com.ar'}
          target="_blank"
          rel="noreferrer"
        >
          Coto {money(item.priceCoto)}
        </a>
      ) : (
        <span className="store-pill muted">Coto —</span>
      )}
      {Number(item.priceCarrefour) > 0 ? (
        <a
          className={`store-pill carrefour ${cheaper === 'carrefour' ? 'cheaper' : ''}`}
          href={item.urlCarrefour || 'https://www.carrefour.com.ar'}
          target="_blank"
          rel="noreferrer"
        >
          Carrefour {money(item.priceCarrefour)}
        </a>
      ) : (
        <span className="store-pill muted">Carrefour —</span>
      )}
        </div>
  )
}

function App() {
  const [theme, setTheme] = useState(loadTheme)
  const [user, setUser] = useState(undefined)
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [category, setCategory] = useState('Alimentos')
  const [modal, setModal] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [openMenu, setOpenMenu] = useState(null)
  const [passwordModal, setPasswordModal] = useState(false)
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
  const itemsRef = useRef(items)
  const searchInputRef = useRef(null)
  const qtySyncRef = useRef({})
  const lastAutoRefreshRef = useRef(0)
  const refreshStorePricesRef = useRef(async () => {})
  itemsRef.current = items

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!hydrated || !user?.id) return
    localStorage.setItem(`${STORAGE_KEY}:${user.id}`, JSON.stringify(items))
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
      if (remote && remote.length > 0) {
        setItems(remote)
      } else {
        const local = loadItems(user.id)
        if (local.length) {
          if (remote) await Promise.all(local.map((item) => upsertRemoteItem(item)))
          setItems(local)
        } else {
          setItems([])
        }
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
      return matchesQuery && item.category === category
    })
  }, [items, query, category])

  const stats = useMemo(() => {
    const units = items.reduce((sum, item) => sum + item.quantity, 0)
    const low = items.filter((item) => statusOf(item) === 'low').length
    const out = items.filter((item) => statusOf(item) === 'out').length
    return { units, low, out }
  }, [items])

  function showToast(message) {
    if (window.matchMedia('(max-width: 760px)').matches) return
    setToast(message)
  }

  function closeScanner() {
    setScanning(false)
    setCameraStream((current) => {
      current?.getTracks().forEach((track) => track.stop())
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
    setPasswordModal(false)
    closeScanner()
    setHydrated(false)
    setItems([])
    setUser(null)
  }

  function openPasswordModal() {
    setOpenMenu(null)
    setPasswordError('')
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordModal(true)
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
    if (!item?.id) return
    upsertRemoteItem(item)
  }

  function updateQty(id, next) {
    const quantity = Math.max(0, next)
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity } : item)))
    clearTimeout(qtySyncRef.current[id])
    qtySyncRef.current[id] = setTimeout(() => {
      const item = itemsRef.current.find((entry) => entry.id === id)
      if (item) persistItem(item)
    }, 450)
  }

  function applyItemStorePrice(id, store) {
    const item = items.find((entry) => entry.id === id)
    const value = store === 'coto' ? Number(item?.priceCoto) : Number(item?.priceCarrefour)
    if (!item || !value) {
      showToast('Elegí un precio de Coto o Carrefour')
      return
    }
    setItems((prev) => {
      const next = prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              price: value,
              priceSource: store,
              image:
                store === 'coto'
                  ? entry.imageCoto || entry.image
                  : entry.imageCarrefour || entry.image,
            }
          : entry,
      )
      const saved = next.find((entry) => entry.id === id)
      if (saved) persistItem(saved)
      return next
    })
    setOpenMenu(null)
    showToast(`Precio de ${item.name} tomado de ${store === 'coto' ? 'Coto' : 'Carrefour'}`)
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
    }))
    setStoreQuery(form.name)
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreError('')
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
    })
    setError('')
    setStoreQuery('')
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreTab('coto')
    setStoreError('')
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
    }))
    setStoreQuery('')
    setStoreResults({ coto: [], carrefour: [], errors: {} })
    setStoreError('')
    setError('')
    showToast(
      product.ean
        ? `Código ${product.ean} detectado`
        : `Precio de ${product.store === 'coto' ? 'Coto' : 'Carrefour'} aplicado`,
    )
  }

  function handleScannedCode(raw) {
    closeScanner()
    const ean = barcodeDigits(raw)
    if (!isBarcode(ean)) {
      setStoreQuery(String(raw || '').trim())
      setStoreError('El código escaneado no parece un EAN válido.')
      return
    }
    setStoreQuery(ean)
    setForm((prev) => ({ ...prev, barcode: ean }))
    setStoreError('')
    showToast(`EAN ${ean} cargado en el buscador`)
    lookupStores(ean)
  }

  async function lookupStores(term) {
    const q = (term || storeQuery || form.barcode || form.name).trim()
    if (!q) {
      setStoreError('Escribí un producto para buscar precios.')
      return
    }
    setStoreQuery(q)
    setStoreLoading(true)
    setStoreError('')
    try {
      const data = await searchSupermarkets(q)
      setStoreResults(data)
      setStoreTab(data.coto.length ? 'coto' : data.carrefour.length ? 'carrefour' : 'coto')
      if (!data.coto.length && !data.carrefour.length) {
        setStoreError(
          data.errors?.coto ||
            data.errors?.carrefour ||
            'No encontramos ese producto en Coto ni Carrefour.',
        )
      }
    } catch {
      setStoreError('No se pudieron consultar Coto y Carrefour.')
    } finally {
      setStoreLoading(false)
    }
  }

  async function refreshStorePrices(item, { silent = false } = {}) {
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
    const price = Number(form.price || 0)
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('La cantidad no es válida.')
      return
    }
    if (!form.priceSource || !Number.isFinite(price) || price <= 0) {
      setError('El precio tiene que salir de Coto o Carrefour.')
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
      priceSource: form.priceSource,
      priceCoto: Number(form.priceCoto) || 0,
      priceCarrefour: Number(form.priceCarrefour) || 0,
      urlCoto: form.urlCoto,
      urlCarrefour: form.urlCarrefour,
      imageCoto,
      imageCarrefour,
      image:
        form.priceSource === 'coto'
          ? imageCoto || form.image
          : form.priceSource === 'carrefour'
            ? imageCarrefour || form.image
            : form.image || imageCoto || imageCarrefour,
    }

    if (editingId) {
      const saved = { id: editingId, ...payload }
      setItems((prev) => prev.map((entry) => (entry.id === editingId ? { ...entry, ...payload } : entry)))
      persistItem(saved)
      setCategory(payload.category)
      closeItemModal()
      setOpenMenu(null)
      showToast(`${payload.name} actualizado`)
      return
    }

    const item = { id: crypto.randomUUID(), ...payload }
    setItems((prev) => [item, ...prev])
    persistItem(item)
    setCategory(item.category)
    closeItemModal()
    setOpenMenu(null)
    showToast(`${item.name} se agregó al inventario`)
  }

  function removeItem(id) {
    const item = items.find((entry) => entry.id === id)
    setItems((prev) => prev.filter((entry) => entry.id !== id))
    deleteRemoteItem(id)
    showToast(`${item?.name || 'Ítem'} eliminado`)
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
    <div className={`app ${modal || scanning || passwordModal ? 'is-overlay' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <h1>Stockea</h1>
        </div>
        <div className="top-actions">
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
        <article className="kpi">
          <span>Productos</span>
          <strong>{items.length}</strong>
          <small>ítems activos</small>
        </article>
        <article className="kpi">
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
            options={CATEGORIES.map((entry) => ({
              value: entry,
              label: entry,
            }))}
            onChange={setCategory}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            full
          />
          <div className="category-tabs" role="tablist" aria-label="Categorías">
            {CATEGORIES.map((entry) => {
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
                  <th>Supermercado</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const currentStatus = statusOf(item)
                  return (
                    <tr key={item.id}>
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
                        <PricePicker
                          item={item}
                          open={openMenu === `price:${item.id}`}
                          onToggle={() => setOpenMenu(openMenu === `price:${item.id}` ? null : `price:${item.id}`)}
                          onPick={(store) => applyItemStorePrice(item.id, store)}
                        />
                      </td>
                      <td>
                        <SuperPrices item={item} />
                      </td>
                      <td>
                        <span className={`badge ${currentStatus}`}>{statusLabel(currentStatus)}</span>
                      </td>
                      <td>
                        <ItemActions
                          item={item}
                          onEdit={() => openEditItem(item)}
                          onRemove={() => removeItem(item.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="item-cards">
            {filtered.map((item) => {
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
                    <PricePicker
                      item={item}
                      open={openMenu === `price:${item.id}`}
                      onToggle={() => setOpenMenu(openMenu === `price:${item.id}` ? null : `price:${item.id}`)}
                      onPick={(store) => applyItemStorePrice(item.id, store)}
                    />
                  </div>
                  <SuperPrices item={item} />
                  <ItemActions
                    item={item}
                    onEdit={() => openEditItem(item)}
                    onRemove={() => removeItem(item.id)}
                  />
                </article>
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
                  onChange={(event) => {
                    setForm({ ...form, name: event.target.value })
                    setStoreQuery(event.target.value)
                  }}
                  placeholder="Nombre del producto"
                />
              </label>
              <div className="field full store-search">
                <span>Buscar</span>
                <div className="store-lookup">
                  <input
                    value={storeQuery}
                    onChange={(event) => setStoreQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        lookupStores()
                      }
                    }}
                    placeholder="Nombre o EAN, ej. 7790742335609"
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
                {(form.priceCoto || form.priceCarrefour) && (
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
                        </button>
                      ) : null}
                      {form.priceCarrefour ? (
                        <button
                          className={`store-pill carrefour ${form.priceSource === 'carrefour' ? 'selected' : ''}`}
                          type="button"
                          onClick={() => applyFormStorePrice('carrefour')}
                        >
                          Carrefour {money(form.priceCarrefour)}
                        </button>
                      ) : null}
                    </div>
                    <button className="btn btn-ghost btn-compact" type="button" onClick={clearStoreProduct}>
                      Quitar
                    </button>
                  </div>
                )}
                {storeLoading && <p className="hint">Buscando…</p>}
                {storeError && <p className="hint">{storeError}</p>}
                {(storeResults.coto.length > 0 || storeResults.carrefour.length > 0) && (
                  <div className="store-results">
                    <div className="store-result-tabs" role="tablist" aria-label="Supermercados">
                      <button
                        className={`store-result-tab coto ${storeTab === 'coto' ? 'active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={storeTab === 'coto'}
                        onClick={() => setStoreTab('coto')}
                      >
                        Coto <small>{storeResults.coto.length}</small>
                      </button>
                      <button
                        className={`store-result-tab carrefour ${storeTab === 'carrefour' ? 'active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={storeTab === 'carrefour'}
                        onClick={() => setStoreTab('carrefour')}
                      >
                        Carrefour <small>{storeResults.carrefour.length}</small>
                      </button>
                    </div>
                    <div className="store-cols">
                      <div className={`store-col ${storeTab === 'coto' ? 'is-open' : ''}`}>
                        <p className="store-col-title coto">Coto Digital</p>
                        {storeResults.coto.length === 0 ? (
                          <p className="hint">{storeResults.errors?.coto || 'Sin coincidencias'}</p>
                        ) : (
                          storeResults.coto.map((product) => (
                            <StoreResult key={product.ean || product.url} product={product} onPick={applyStoreProduct} />
                          ))
                        )}
                      </div>
                      <div className={`store-col ${storeTab === 'carrefour' ? 'is-open' : ''}`}>
                        <p className="store-col-title carrefour">Carrefour</p>
                        {storeResults.carrefour.length === 0 ? (
                          <p className="hint">{storeResults.errors?.carrefour || 'Sin coincidencias'}</p>
                        ) : (
                          storeResults.carrefour.map((product) => (
                            <StoreResult key={product.ean || product.url} product={product} onPick={applyStoreProduct} />
                          ))
                        )}
                      </div>
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
                <div className="money-input locked">
                  <span>$</span>
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
                </div>
                <small className="hint">
                  Solo se completa con el precio de Coto o Carrefour
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

      {passwordModal && (
        <div className="overlay">
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
