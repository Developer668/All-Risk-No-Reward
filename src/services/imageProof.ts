const IMAGE_INLINE_LIMIT = 170 * 1024
const VIDEO_INLINE_LIMIT = 5 * 1024 * 1024
const VIDEO_DURATION_LIMIT_SECONDS = 30

function dataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(',')[1] ?? ''
  return Math.ceil(payload.length * 0.75)
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('This browser could not prepare the video.'))
    }
    reader.onerror = () => reject(new Error('This browser could not read the video.'))
    reader.readAsDataURL(file)
  })
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = video.duration
      URL.revokeObjectURL(url)
      if (Number.isFinite(duration)) resolve(duration)
      else reject(new Error('Could not read the video duration.'))
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Choose a valid MP4, MOV, or WebM video.'))
    }
    video.src = url
  })
}

export async function preparePrivateProofMedia(file: File): Promise<string> {
  if (['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) {
    if (file.size > VIDEO_INLINE_LIMIT) throw new Error('Choose a video smaller than 5 MB.')
    const duration = await videoDuration(file)
    if (duration > VIDEO_DURATION_LIMIT_SECONDS) throw new Error('Choose a video that is 30 seconds or shorter.')
    return readDataUrl(file)
  }

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
    if (dataUrlBytes(dataUrl) <= IMAGE_INLINE_LIMIT) return dataUrl
  }
  throw new Error('This image is still too detailed after privacy-safe compression. Crop it more tightly and try again.')
}
