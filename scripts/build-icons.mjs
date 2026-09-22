import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** Scale so the cube (~20u of 32) fills most of the canvas. */
const LOGO_BOOST = 1.16

function iconSvg({ size, pad = 0.04 }) {
  const fillScale = ((size * (1 - pad * 2)) / 32) * LOGO_BOOST
  const logoBox = 32 * fillScale
  const tx = (size - logoBox) / 2
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="glowLime" cx="18%" cy="8%" r="72%">
      <stop offset="0%" stop-color="#d4f562" stop-opacity=".28"/>
      <stop offset="100%" stop-color="#d4f562" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowMint" cx="96%" cy="12%" r="68%">
      <stop offset="0%" stop-color="#7ee2b8" stop-opacity=".22"/>
      <stop offset="100%" stop-color="#7ee2b8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#0b0d0c"/>
  <rect width="${size}" height="${size}" fill="url(#glowLime)"/>
  <rect width="${size}" height="${size}" fill="url(#glowMint)"/>
  <g transform="translate(${tx} ${tx}) scale(${fillScale})">
    <path fill="#d4f562" d="M16 6.1 25.4 11.1 16 16.1 6.6 11.1Z"/>
    <path fill="#7a9c24" d="M6.6 11.1 16 16.1v9.8L6.6 20.9Z"/>
    <path fill="#7ee2b8" d="M25.4 11.1 16 16.1v9.8l9.4-5Z"/>
  </g>
</svg>`
}

async function writePng(name, svg) {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
  await sharp(png).toFile(join(outDir, name))
}

await mkdir(outDir, { recursive: true })

await writePng('favicon-32.png', iconSvg({ size: 32, pad: 0.02 }))
await writePng('apple-touch-icon.png', iconSvg({ size: 180, pad: 0.04 }))
await writePng('icon-192.png', iconSvg({ size: 192, pad: 0.03 }))
await writePng('icon-512.png', iconSvg({ size: 512, pad: 0.03 }))
await writePng('icon-192-maskable.png', iconSvg({ size: 192, pad: 0.1 }))
await writePng('icon-512-maskable.png', iconSvg({ size: 512, pad: 0.1 }))

console.log('icons generated')
