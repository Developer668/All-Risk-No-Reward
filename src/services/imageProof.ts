const NVIDIA_INLINE_LIMIT = 170 * 1024

function dataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(',')[1] ?? ''
  return Math.ceil(payload.length * 0.75)
}

export async function preparePrivateProofImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, or WebP image.')
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.')

  const bitmap = await createImageBitmap(file)
  const maxDimension = 1280
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not prepare the image.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(dataUrl) <= NVIDIA_INLINE_LIMIT) return dataUrl
  }
  throw new Error('This image is still too detailed after privacy-safe compression. Crop it more tightly and try again.')
}
