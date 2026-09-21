const GRANT_KEY = 'stockly-camera-granted'

function markGranted() {
  try {
    localStorage.setItem(GRANT_KEY, '1')
  } catch {
    /* ignore */
  }
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
  return (
    isStandalonePwa() ||
    isAppleTouch() ||
    window.matchMedia('(max-width: 760px)').matches ||
    /Android|Mobile/i.test(navigator.userAgent)
  )
}

function keepIosGrant() {
  return isAppleTouch() && isStandalonePwa()
}

function liveStream(stream) {
  return stream?.getVideoTracks().some((track) => track.readyState === 'live') ? stream : null
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

function facingOf(stream) {
  return String(stream?.getVideoTracks()[0]?.getSettings?.()?.facingMode || '').toLowerCase()
}

function isFrontStream(stream) {
  const facing = facingOf(stream)
  if (facing === 'user') return true
  return scoreBackCamera(stream?.getVideoTracks()[0]?.label || '') < 0
}

function isRearStream(stream) {
  if (!stream || isFrontStream(stream)) return false
  const facing = facingOf(stream)
  if (facing === 'environment') return true
  return scoreBackCamera(stream.getVideoTracks()[0]?.label || '') > 0
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

const REAR_CONSTRAINTS = [
  { audio: false, video: { facingMode: { exact: 'environment' } } },
  { audio: false, video: { facingMode: { ideal: 'environment' } } },
  { audio: false, video: { facingMode: 'environment' } },
]

async function openWithConstraints(constraints) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  if (isFrontStream(stream)) {
    stopStream(stream)
    return null
  }
  return stream
}

async function openRearCamera() {
  for (const constraints of REAR_CONSTRAINTS) {
    try {
      const stream = await openWithConstraints(constraints)
      if (stream) return stream
    } catch {
      /* try next constraint */
    }
  }

  let stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  const track = stream.getVideoTracks()[0]
  try {
    await track?.applyConstraints({ facingMode: 'environment' })
  } catch {
    /* iOS often ignores facingMode on applyConstraints */
  }
  if (isRearStream(stream)) return stream

  const backId = await backCameraDeviceId()
  const currentId = track?.getSettings?.()?.deviceId
  if (backId && backId !== currentId) {
    stopStream(stream)
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: backId }, facingMode: { ideal: 'environment' } },
    })
  }
  return stream
}

let heldStream = null

function setHeldStream(stream) {
  heldStream = stream
  const track = stream?.getVideoTracks()[0]
  track?.addEventListener(
    'ended',
    () => {
      if (heldStream === stream) heldStream = null
    },
    { once: true },
  )
}

export async function getCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Este navegador no permite usar la cámara.')
    error.name = 'NotSupportedError'
    throw error
  }

  const reused = liveStream(heldStream)
  if (reused && (!isMobileOrPwa() || !isFrontStream(reused))) {
    reused.getTracks().forEach((track) => {
      track.enabled = true
    })
    return reused
  }
  if (reused) stopStream(reused)
  heldStream = null

  const stream = isMobileOrPwa()
    ? await openRearCamera()
    : await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      })

  setHeldStream(stream)
  markGranted()
  return stream
}

export function releaseCameraStream(stream) {
  const target = stream || heldStream
  if (!target) return

  if (keepIosGrant() && liveStream(target)) {
    target.getTracks().forEach((track) => {
      track.enabled = false
    })
    if (!heldStream) setHeldStream(target)
    return
  }

  stopStream(target)
  if (!stream || heldStream === stream) heldStream = null
}

window.addEventListener('pagehide', () => {
  stopStream(heldStream)
  heldStream = null
})
