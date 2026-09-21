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

function keepIosGrant() {
  return isAppleTouch() && isStandalonePwa()
}

function liveStream(stream) {
  return stream?.getVideoTracks().some((track) => track.readyState === 'live') ? stream : null
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

async function preferBackCamera(stream) {
  const track = stream.getVideoTracks()[0]
  if (!track) return
  try {
    await track.applyConstraints({ facingMode: 'environment' })
  } catch {
    /* iOS may keep the default camera; scanning still works */
  }
}

export async function getCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Este navegador no permite usar la cámara.')
    error.name = 'NotSupportedError'
    throw error
  }

  const reused = liveStream(heldStream)
  if (reused) {
    reused.getTracks().forEach((track) => {
      track.enabled = true
    })
    return reused
  }
  heldStream = null

  // iOS PWA stores a generic camera grant. Asking with facingMode on a new
  // launch is what makes Safari show the dialog again every time.
  const applePwa = keepIosGrant()
  const stream = applePwa
    ? await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    : await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      })

  if (applePwa) await preferBackCamera(stream)
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

  target.getTracks().forEach((track) => track.stop())
  if (!stream || heldStream === stream) heldStream = null
}

window.addEventListener('pagehide', () => {
  heldStream?.getTracks().forEach((track) => track.stop())
  heldStream = null
})
