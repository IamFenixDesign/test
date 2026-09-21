import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { barcodeDigits, cheaperOf, guessCategory, isBarcode, matchByEan, searchSupermarkets } from './supermarkets'
import { deleteRemoteItem, fetchRemoteItems, upsertRemoteItem } from './itemsApi'
import { fetchMe, logout as logoutRequest } from './auth'
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

const STATUS_FILTER = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'ok', label: 'En stock' },
  { value: 'low', label: 'Stock bajo' },
  { value: 'out', label: 'Sin stock' },
]

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7 4.9 19.1M19.1 4.9l-1.4 1.4" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 3v6h-6" />
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
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

function BarcodeScanner({ onDetect, onCancel }) {
  const videoRef = useRef(null)
  const onDetectRef = useRef(onDetect)
  const streamRef = useRef(null)
  const [message, setMessage] = useState('Apuntá el código de barras al recuadro')
  const [live, setLive] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  onDetectRef.current = onDetect

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    let stream
    let raf = 0
    let stopped = false
    let zxingControls

    function finish(value) {
      if (stopped) return
      stopped = true
      onDetectRef.current(value)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('Este navegador no permite usar la cámara.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
        streamRef.current = stream
        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.srcObject = stream
        await video.play()
        setLive(true)
        setMessage('Mantené el código quieto dentro del recuadro')
        const track = stream.getVideoTracks()[0]
        if (track?.getCapabilities?.().torch) setHasTorch(true)

        const Detector = window.BarcodeDetector
        if (typeof Detector === 'function') {
          const preferred = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']
          let formats = preferred
          if (typeof Detector.getSupportedFormats === 'function') {
            const supported = await Detector.getSupportedFormats()
            formats = preferred.filter((format) => supported.includes(format))
          }
          const detector = new Detector({ formats: formats.length ? formats : preferred })
          const tick = async () => {
            if (stopped) return
            try {
              if (video.readyState >= 2) {
                const codes = await detector.detect(video)
                const raw = codes[0]?.rawValue
                if (raw) {
                  finish(raw)
                  return
                }
              }
            } catch {
              /* skip unreadable frame */
            }
            raf = requestAnimationFrame(tick)
          }
          tick()
          return
        }

        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        zxingControls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) finish(result.getText())
        })
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
      cancelAnimationFrame(raf)
      zxingControls?.stop?.()
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      video.srcObject = null
    }
  }, [])

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
        <video ref={videoRef} autoPlay muted playsInline />
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

function ItemActions({ item, qtyOpen, qtyDraft, setQtyDraft, onAddQty, onEdit, onRemove, setOpenMenu }) {
  return (
    <div className="row-actions">
      <div className="qty-popover" data-menu={`qty:${item.id}`}>
        <button
          className="icon-btn"
          type="button"
          title="Agregar cantidad"
          aria-label={`Ajustar cantidad de ${item.name}`}
          onClick={() => setOpenMenu(qtyOpen ? null : `qty:${item.id}`)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {qtyOpen && (
          <div className="qty-menu">
            <p>Sumar o restar unidades</p>
            <div className="row">
              <input
                type="number"
                value={qtyDraft[item.id] ?? ''}
                onChange={(event) =>
                  setQtyDraft((prev) => ({
                    ...prev,
                    [item.id]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onAddQty(item.id, qtyDraft[item.id])
                }}
                placeholder="Ej. 10 o -3"
              />
              <button className="btn btn-primary" type="button" onClick={() => onAddQty(item.id, qtyDraft[item.id])}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
      <button className="icon-btn" type="button" title="Editar" aria-label={`Editar ${item.name}`} onClick={onEdit}>
        <IconEdit />
      </button>
      <button className="icon-btn" type="button" title="Eliminar" aria-label={`Eliminar ${item.name}`} onClick={onRemove}>
        ×
      </button>
    </div>
  )
}

function SuperPrices({ item, onRefresh, refreshing }) {
  const cheaper = cheaperOf(item.priceCoto, item.priceCarrefour)
  const hasPrices = Number(item.priceCoto) > 0 || Number(item.priceCarrefour) > 0
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
      <button
        className="icon-btn refresh-btn"
        type="button"
        title={hasPrices ? 'Actualizar precios' : 'Buscar en Coto y Carrefour'}
        aria-label={`Actualizar precios de ${item.name}`}
        disabled={refreshing}
        onClick={onRefresh}
      >
        <IconRefresh />
      </button>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState(loadTheme)
  const [user, setUser] = useState(undefined)
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Alimentos')
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [qtyDraft, setQtyDraft] = useState({})
  const [openMenu, setOpenMenu] = useState(null)
  const [storeQuery, setStoreQuery] = useState('')
  const [storeResults, setStoreResults] = useState({ coto: [], carrefour: [], errors: {} })
  const [storeLoading, setStoreLoading] = useState(false)
  const [storeError, setStoreError] = useState('')
  const [refreshingId, setRefreshingId] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const itemsRef = useRef(items)
  const qtySyncRef = useRef({})
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
      const matchesCategory = item.category === category
      const matchesStatus = status === 'all' || statusOf(item) === status
      return matchesQuery && matchesCategory && matchesStatus
    })
  }, [items, query, category, status])

  const stats = useMemo(() => {
    const units = items.reduce((sum, item) => sum + item.quantity, 0)
    const low = items.filter((item) => statusOf(item) === 'low').length
    const out = items.filter((item) => statusOf(item) === 'out').length
    return { units, low, out }
  }, [items])

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(CATEGORIES.map((entry) => [entry, 0]))
    for (const item of items) {
      counts[item.category] = (counts[item.category] || 0) + 1
    }
    return counts
  }, [items])

  function showToast(message) {
    if (window.matchMedia('(max-width: 760px)').matches) return
    setToast(message)
  }

  async function handleLogout() {
    await logoutRequest()
    setOpenMenu(null)
    setModal(null)
    setScanning(false)
    setHydrated(false)
    setItems([])
    setUser(null)
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

  function addQty(id, amount) {
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed === 0) return
    const item = items.find((entry) => entry.id === id)
    if (!item) return
    updateQty(id, item.quantity + parsed)
    setQtyDraft((prev) => ({ ...prev, [id]: '' }))
    setOpenMenu(null)
    showToast(`${parsed > 0 ? 'Se sumaron' : 'Se restaron'} ${Math.abs(parsed)} a ${item.name}`)
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
    setStoreError('')
    setOpenMenu(null)
    setScanning(false)
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
    setStoreError('')
    setOpenMenu(null)
    setScanning(false)
    setModal('item')
  }

  function closeItemModal() {
    setScanning(false)
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
    setScanning(false)
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

  async function refreshStorePrices(item) {
    setRefreshingId(item.id)
    const code = barcodeOf(item)
    try {
      const data = await searchSupermarkets(code || item.name)
      const pick = (list) => (code && list.find((entry) => entry.ean === code)) || list[0] || null
      const coto = pick(data.coto)
      const carrefour = pick(data.carrefour)
      if (!coto && !carrefour) {
        showToast('No se encontraron precios en Coto ni Carrefour')
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
      showToast(`Precios de ${item.name} actualizados`)
    } catch {
      showToast('No se pudieron consultar los supermercados')
    } finally {
      setRefreshingId(null)
    }
  }

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
      <div className="login-screen">
        <section className="login-card">
          <div className="login-brand">
            <div className="logo">
              <IconMark />
            </div>
            <div>
              <h1>Stockea</h1>
              <p>Cargando…</p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (!user) {
    return <Login theme={theme} setTheme={setTheme} onLoggedIn={setUser} />
  }

  return (
    <div className={`app ${modal || scanning ? 'is-overlay' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <IconMark />
          </div>
          <div>
            <h1>Stockea</h1>
            <p>Control de inventario en tiempo real</p>
          </div>
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
              <div className="qty-menu user-menu">
                <p>{user.name || user.email || 'Cuenta'}</p>
                <button className="btn btn-ghost" type="button" onClick={handleLogout}>
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
        <div className="toolbar">
          <label className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
                </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o EAN"
            />
          </label>
          <MenuSelect
            id="filter-status"
            value={status}
            options={STATUS_FILTER}
            onChange={setStatus}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            align="right"
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
                  <small>{categoryCounts[entry] || 0}</small>
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
                  {query.trim() || status !== 'all'
                    ? 'Probá con otro filtro o búsqueda.'
                    : `Esta categoría está vacía. Cambiá de pestaña o agregá un ítem en ${category}.`}
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
                  <th>Coto / Carrefour</th>
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
                        <SuperPrices
                          item={item}
                          refreshing={refreshingId === item.id}
                          onRefresh={() => refreshStorePrices(item)}
                        />
                      </td>
                      <td>
                        <span className={`badge ${currentStatus}`}>{statusLabel(currentStatus)}</span>
                      </td>
                      <td>
                        <ItemActions
                          item={item}
                          qtyOpen={openMenu === `qty:${item.id}`}
                          qtyDraft={qtyDraft}
                          setQtyDraft={setQtyDraft}
                          onAddQty={addQty}
                          onEdit={() => openEditItem(item)}
                          onRemove={() => removeItem(item.id)}
                          setOpenMenu={setOpenMenu}
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
                  <SuperPrices
                    item={item}
                    refreshing={refreshingId === item.id}
                    onRefresh={() => refreshStorePrices(item)}
                  />
                  <ItemActions
                    item={item}
                    qtyOpen={openMenu === `qty:${item.id}`}
                    qtyDraft={qtyDraft}
                    setQtyDraft={setQtyDraft}
                    onAddQty={addQty}
                    onEdit={() => openEditItem(item)}
                    onRemove={() => removeItem(item.id)}
                    setOpenMenu={setOpenMenu}
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
                  autoFocus
                />
              </label>
              <div className="field full store-search">
                <span>Precios en Coto y Carrefour</span>
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
                      setStoreError('')
                      setScanning(true)
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
                  <div className="store-cols">
                    <div>
                      <p className="store-col-title coto">Coto Digital</p>
                      {storeResults.coto.length === 0 ? (
                        <p className="hint">{storeResults.errors?.coto || 'Sin coincidencias'}</p>
                      ) : (
                        storeResults.coto.map((product) => (
                          <StoreResult key={product.ean || product.url} product={product} onPick={applyStoreProduct} />
                        ))
                      )}
                    </div>
                    <div>
                      <p className="store-col-title carrefour">Carrefour</p>
                      {storeResults.carrefour.length === 0 ? (
                        <p className="hint">Sin coincidencias</p>
                      ) : (
                        storeResults.carrefour.map((product) => (
                          <StoreResult key={product.ean || product.url} product={product} onPick={applyStoreProduct} />
                        ))
                      )}
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
                    placeholder="Coto o Carrefour"
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

      {scanning && (
        <BarcodeScanner onDetect={handleScannedCode} onCancel={() => setScanning(false)} />
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
