const GRANT_KEY = 'stockly-camera-granted'
const DEVICE_KEY = 'stockly-camera-device'

function markGranted() {
  try {
    localStorage.setItem(GRANT_KEY, '1')
  } catch {
    /* ignore */
  }
}

function savedDeviceId() {
  try {
    return localStorage.getItem(DEVICE_KEY) || ''
  } catch {
    return ''
  }
}

function saveDevice(stream) {
  const id = stream?.getVideoTracks()[0]?.getSettings?.()?.deviceId
  if (id) {
    try {
      localStorage.setItem(DEVICE_KEY, id)
    } catch {
      /* ignore */
    }
  }
  markGranted()
}

function isAppleTouch() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalonePwa() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  )
}

function isMobileOrPwa() {
  if (document.documentElement.classList.contains('is-desktop-site')) {
    return window.matchMedia('(max-width: 760px)').matches
  }
  return (
    isStandalonePwa() ||
    isAppleTouch() ||
    window.matchMedia('(max-width: 760px)').matches ||
    /Android|Mobile/i.test(navigator.userAgent)
  )
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop()
    } catch {
      /* already stopped */
    }
  })
}

function facingOf(stream) {
  return String(stream?.getVideoTracks()[0]?.getSettings?.()?.facingMode || '').toLowerCase()
}

function isFrontStream(stream) {
  const facing = facingOf(stream)
  if (facing === 'user') return true
  return scoreBackCamera(stream?.getVideoTracks()[0]?.label || '') < 0
}

function scoreBackCamera(label = '') {
  const text = label.toLowerCase()
  if (!text) return 0
  if (/front|user|face|frontal|delantera/.test(text)) return -1
  if (/ultra\s*wide|telephoto|\btele\b/.test(text)) return 1
  if (/back|rear|environment|trasera|dual|wide/.test(text)) return 3
  return 0
}

async function backCameraDeviceId() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const videos = devices.filter((device) => device.kind === 'videoinput')
  if (!videos.length) return ''

  let best = null
  let bestScore = 0
  for (const device of videos) {
    const score = scoreBackCamera(device.label)
    if (score > bestScore) {
      best = device
      bestScore = score
    }
  }
  if (best) return best.deviceId
  if (videos.length > 1) return videos[videos.length - 1].deviceId
  return videos[0].deviceId
}

const HIGH_RES = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
}

const REAR_CONSTRAINTS = [
  { audio: false, video: { facingMode: { exact: 'environment' }, ...HIGH_RES } },
  { audio: false, video: { facingMode: { ideal: 'environment' }, ...HIGH_RES } },
  { audio: false, video: { facingMode: 'environment', ...HIGH_RES } },
]

async function enhanceForBarcode(stream) {
  const track = stream?.getVideoTracks?.()[0]
  if (!track?.applyConstraints) return stream

  const caps = track.getCapabilities?.() || {}
  try {
    const widthIdeal = Math.min(1920, caps.width?.max || 1920)
    const heightIdeal = Math.min(1080, caps.height?.max || 1080)
    const advanced = []
    if (caps.focusMode?.includes?.('continuous')) {
      advanced.push({ focusMode: 'continuous' })
    }
    await track.applyConstraints({
      width: { ideal: widthIdeal },
      height: { ideal: heightIdeal },
      ...(advanced.length ? { advanced } : {}),
    })
  } catch {
    try {
      if (caps.focusMode?.includes?.('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
      }
    } catch {
      /* device may reject advanced focus/resolution */
    }
  }
  return stream
}

async function openWithConstraints(constraints) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  if (isFrontStream(stream)) {
    stopStream(stream)
    return null
  }
  return stream
}

// iOS persists a generic camera grant. facingMode in getUserMedia is what
// makes Safari and the PWA ask again on every launch.
const IOS_GRANT = { audio: false, video: true }

async function switchToRear(stream) {
  const track = stream.getVideoTracks()[0]
  try {
    await track?.applyConstraints({ facingMode: 'environment' })
  } catch {
    /* iOS often ignores facingMode on applyConstraints */
  }
  if (!isFrontStream(stream)) {
    saveDevice(stream)
    return stream
  }

  const backId = savedDeviceId() || (await backCameraDeviceId())
  const currentId = track?.getSettings?.()?.deviceId
  if (!backId || backId === currentId) {
    saveDevice(stream)
    return stream
  }

  stopStream(stream)
  const next = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { deviceId: { exact: backId } },
  })
  saveDevice(next)
  return next
}

async function openIosCamera() {
  const knownId = savedDeviceId()
  if (knownId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: knownId } },
      })
      saveDevice(stream)
      return stream
    } catch {
      /* deviceId can rotate; fall through to the persisted generic grant */
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia(IOS_GRANT)
  return switchToRear(stream)
}

async function openRearCamera() {
  for (const constraints of REAR_CONSTRAINTS) {
    try {
      const stream = await openWithConstraints(constraints)
      if (stream) {
        saveDevice(stream)
        return stream
      }
    } catch {
      /* try next constraint */
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia(IOS_GRANT)
  return switchToRear(stream)
}

let heldStream = null

export async function getCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Este navegador no permite usar la cámara.')
    error.name = 'NotSupportedError'
    throw error
  }

  stopStream(heldStream)
  heldStream = null

  const stream = isAppleTouch()
    ? await openIosCamera()
    : isMobileOrPwa()
      ? await openRearCamera()
      : await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'environment', ...HIGH_RES },
        })

  heldStream = await enhanceForBarcode(stream)
  const active = heldStream
  active.getVideoTracks()[0]?.addEventListener(
    'ended',
    () => {
      if (heldStream === active) heldStream = null
    },
    { once: true },
  )
  saveDevice(active)
  return active
}

export function releaseCameraStream(stream) {
  const target = stream || heldStream
  stopStream(target)
  if (!stream || heldStream === stream) heldStream = null
}

window.addEventListener('pagehide', () => {
  stopStream(heldStream)
  heldStream = null
})
