import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resDir = join(root, 'android', 'app', 'src', 'main', 'res')

/** Densities: legacy launcher size + adaptive foreground size (108dp). */
const DENSITIES = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
]

/** Solo el cubo, sin rectángulo/círculo de fondo. */
function logoSvg(size, { pad = 0.12 } = {}) {
  const fillScale = (size * (1 - pad * 2)) / 32
  const logoBox = 32 * fillScale
  const tx = (size - logoBox) / 2
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${tx} ${tx}) scale(${fillScale})">
    <path fill="#d4f562" d="M16 6.1 25.4 11.1 16 16.1 6.6 11.1Z"/>
    <path fill="#7a9c24" d="M6.6 11.1 16 16.1v9.8L6.6 20.9Z"/>
    <path fill="#7ee2b8" d="M25.4 11.1 16 16.1v9.8l9.4-5Z"/>
  </g>
</svg>`
}

async function writePng(path, svg) {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
  await sharp(png).toFile(path)
}

for (const { folder, launcher, foreground } of DENSITIES) {
  const dir = join(resDir, folder)
  await mkdir(dir, { recursive: true })

  const launcherSvg = logoSvg(launcher, { pad: 0.1 })
  const foregroundSvg = logoSvg(foreground, { pad: 0.18 })

  await writePng(join(dir, 'ic_launcher.png'), launcherSvg)
  await writePng(join(dir, 'ic_launcher_round.png'), launcherSvg)
  await writePng(join(dir, 'ic_launcher_foreground.png'), foregroundSvg)
  console.log(folder, launcher, foreground)
}

console.log('android icons: logo only, transparent background')
