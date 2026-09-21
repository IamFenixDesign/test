const GRANT_KEY = 'stockly-camera-granted'
const READY_KEY = 'stockly-camera-ready'

function markGranted() {
  try {
    localStorage.setItem(GRANT_KEY, '1')
  } catch {
    /* ignore */
  }
}

async function preferredConstraints() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter((device) => device.kind === 'videoinput')
    const rear =
      cams.find((device) => /back|rear|environment|trasera|posterior/i.test(device.label)) ||
      (cams.length > 1 ? cams[cams.length - 1] : cams[0])
    if (rear?.deviceId) {
      return { audio: false, video: { deviceId: { exact: rear.deviceId }, facingMode: { ideal: 'environment' } } }
    }
  } catch {
    /* ignore */
  }
  return { audio: false, video: { facingMode: { ideal: 'environment' } } }
}

export async function getCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Este navegador no permite usar la cámara.')
    error.name = 'NotSupportedError'
    throw error
  }

  const basic = { audio: false, video: { facingMode: { ideal: 'environment' } } }
  let stream = await navigator.mediaDevices.getUserMedia(basic)
  markGranted()

  const firstOpen = !sessionStorage.getItem(READY_KEY)
  if (firstOpen) {
    stream.getTracks().forEach((track) => track.stop())
    await new Promise((resolve) => setTimeout(resolve, 160))
    stream = await navigator.mediaDevices.getUserMedia(await preferredConstraints())
    try {
      sessionStorage.setItem(READY_KEY, '1')
    } catch {
      /* ignore */
    }
  } else {
    try {
      const next = await navigator.mediaDevices.getUserMedia(await preferredConstraints())
      stream.getTracks().forEach((track) => track.stop())
      stream = next
    } catch {
      /* keep the stream that already works */
    }
  }

  return stream
}
