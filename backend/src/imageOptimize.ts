import sharp from "sharp"

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
])

export const isOptimizableImage = (mimeType: string) => IMAGE_TYPES.has(mimeType)

export const optimizeFullImage = async (buffer: Buffer) =>
  sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 78, effort: 4 })
    .toBuffer()

export const optimizeThumbImage = async (buffer: Buffer) =>
  sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 360,
      height: 360,
      fit: "cover",
      withoutEnlargement: true,
    })
    .webp({ quality: 48, effort: 4 })
    .toBuffer()

export const optimizeAvatarFull = async (buffer: Buffer) =>
  sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 512,
      height: 512,
      fit: "cover",
    })
    .webp({ quality: 80, effort: 4 })
    .toBuffer()

export const optimizeWallpaper = async (buffer: Buffer) =>
  sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 78, effort: 4 })
    .toBuffer()

const toHexByte = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0")

export const extractWallpaperColor = async (buffer: Buffer) => {
  const { dominant } = await sharp(buffer, { failOn: "none" }).rotate().resize(64, 64, { fit: "cover" }).stats()
  const veil = 0.7
  return `#${toHexByte(dominant.r * veil)}${toHexByte(dominant.g * veil)}${toHexByte(dominant.b * veil)}`
}

export const optimizeAvatarThumb = async (buffer: Buffer) =>
  sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 256,
      height: 256,
      fit: "cover",
    })
    .webp({ quality: 72, effort: 4 })
    .toBuffer()
