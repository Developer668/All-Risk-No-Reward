const IMAGE_INLINE_LIMIT = 170 * 1024
const VIDEO_FILE_LIMIT = 80 * 1024 * 1024
const VIDEO_DURATION_LIMIT_SECONDS = 30
// Three low-resolution frames are enough for coarse action verification while
// keeping multimodal token usage predictable across multi-video submissions.
const VIDEO_FRAME_COUNT = 3

export interface PreparedVideoFrame {
  dataUrl: string
  timestampSeconds: number
}

export type PreparedProofMedia =
  | { kind: 'image'; dataUrl: string }
  | { kind: 'video'; frames: PreparedVideoFrame[]; durationSeconds: number }

function dataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(',')[1] ?? ''
  return Math.ceil(payload.length * 0.75)
}

function resolvedVideoDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) return Promise.resolve(video.duration)

  // MediaRecorder WebM blobs in Chromium can report Infinity until the browser
  // is asked to seek. That blob is still valid; the seek makes its real duration
  // available without uploading or rewriting the recording.
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Could not read the video duration.'))
    }, 5_000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('durationchange', inspect)
      video.removeEventListener('seeked', inspect)
      video.removeEventListener('timeupdate', inspect)
    }
    const inspect = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : Number.isFinite(video.currentTime) && video.currentTime > 0 && video.currentTime < 1e100
          ? video.currentTime
          : 0
      if (!duration) return
      cleanup()
      video.currentTime = 0
      resolve(duration)
    }
    video.addEventListener('durationchange', inspect)
    video.addEventListener('seeked', inspect)
    video.addEventListener('timeupdate', inspect)
    video.currentTime = 1e101
  })
}

function videoElement(file: File): Promise<{ video: HTMLVideoElement; url: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      void resolvedVideoDuration(video).then((duration) => resolve({ video, url, duration })).catch(() => {
        URL.revokeObjectURL(url)
        reject(new Error('Could not read the video duration.'))
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Choose a valid MP4, MOV, or WebM video.'))
    }
    video.src = url
  })
}

function seek(video: HTMLVideoElement, timestampSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Could not sample frames from this video. Try a shorter MP4 or WebM file.'))
    }, 8_000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    const onSeeked = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Could not read this part of the video.')) }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = timestampSeconds
  })
}

function frameDataUrl(video: HTMLVideoElement): string {
  const maxDimension = 720
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not prepare video frames.')
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  for (const quality of [0.72, 0.62, 0.52, 0.42, 0.32]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(dataUrl) <= IMAGE_INLINE_LIMIT) return dataUrl
  }
  throw new Error('A sampled frame is too detailed. Try a lower-resolution video.')
}

async function prepareVideo(file: File): Promise<PreparedProofMedia> {
  if (file.size > VIDEO_FILE_LIMIT) throw new Error('Choose a video smaller than 80 MB.')
  const { video, url, duration } = await videoElement(file)
  try {
    if (duration > VIDEO_DURATION_LIMIT_SECONDS) throw new Error('Choose a video that is 30 seconds or shorter.')
    const count = VIDEO_FRAME_COUNT
    const start = Math.min(0.15, duration / 10)
    const end = Math.max(start, duration - 0.15)
    const timestamps = Array.from({ length: count }, (_, index) =>
      start + ((end - start) * index) / (count - 1),
    )
    const frames: PreparedVideoFrame[] = []
    for (const timestampSeconds of timestamps) {
      await seek(video, timestampSeconds)
      frames.push({ dataUrl: frameDataUrl(video), timestampSeconds: Math.round(timestampSeconds * 10) / 10 })
    }
    return { kind: 'video', frames, durationSeconds: Math.round(duration * 10) / 10 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function prepareImage(file: File): Promise<PreparedProofMedia> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a video, PNG, JPG, or WebP image.')
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
    if (dataUrlBytes(dataUrl) <= IMAGE_INLINE_LIMIT) return { kind: 'image', dataUrl }
  }
  throw new Error('This image is still too detailed after privacy-safe compression. Crop it more tightly and try again.')
}

export async function preparePrivateProofMedia(file: File): Promise<PreparedProofMedia> {
  if (file.type.startsWith('video/')) return prepareVideo(file)
  return prepareImage(file)
}
