import { useEffect, useRef, useState } from 'react'
import frameImage from '../assets/test-frame.png'

const FRAME_SIZE = 1200
const PHOTO_CIRCLE = {
  centerX: 600,
  centerY: 600,
  radius: 395,
}

const primaryButtonClass =
  'inline-flex items-center justify-center rounded-full bg-brand-sky px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-sky-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

const ghostButtonClass =
  'inline-flex items-center justify-center rounded-full bg-brand-ink/8 px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

function App() {
  const [photoSrc, setPhotoSrc] = useState('')
  const [photoMeta, setPhotoMeta] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

  const frameRef = useRef(null)
  const photoRef = useRef(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const previewRef = useRef(null)
  const streamRef = useRef(null)
  const dragStateRef = useRef(null)

  const circleDiameter = PHOTO_CIRCLE.radius * 2

  useEffect(() => {
    return () => {
      stopCameraStream()
    }
  }, [])

  useEffect(() => {
    if (!cameraActive || !videoRef.current) {
      return
    }

    videoRef.current.srcObject = streamRef.current
  }, [cameraActive])

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function clampOffset(nextOffset, currentZoom = zoom, currentMeta = photoMeta) {
    if (!currentMeta) {
      return { x: 0, y: 0 }
    }

    const drawWidth = currentMeta.width * currentMeta.baseScale * currentZoom
    const drawHeight = currentMeta.height * currentMeta.baseScale * currentZoom
    const centeredX = PHOTO_CIRCLE.centerX - drawWidth / 2
    const centeredY = PHOTO_CIRCLE.centerY - drawHeight / 2
    const minX = PHOTO_CIRCLE.centerX + PHOTO_CIRCLE.radius - drawWidth
    const maxX = PHOTO_CIRCLE.centerX - PHOTO_CIRCLE.radius
    const minY = PHOTO_CIRCLE.centerY + PHOTO_CIRCLE.radius - drawHeight
    const maxY = PHOTO_CIRCLE.centerY - PHOTO_CIRCLE.radius

    const desiredX = centeredX + nextOffset.x
    const desiredY = centeredY + nextOffset.y

    return {
      x: clamp(desiredX, minX, maxX) - centeredX,
      y: clamp(desiredY, minY, maxY) - centeredY,
    }
  }

  function buildPhotoMeta(width, height) {
    const baseScale = Math.max(circleDiameter / width, circleDiameter / height)
    return { width, height, baseScale }
  }

  function updatePhoto(source, width, height) {
    const meta = buildPhotoMeta(width, height)
    setPhotoMeta(meta)
    setZoom(1)
    setOffset(clampOffset({ x: 0, y: 0 }, 1, meta))
    setPhotoSrc(source)
  }

  function onFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        updatePhoto(reader.result, image.naturalWidth, image.naturalHeight)
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  async function startCamera() {
    try {
      stopCameraStream()
      setCameraError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
        },
        audio: false,
      })

      streamRef.current = stream
      setCameraActive(true)
    } catch {
      setCameraError('Camera access was blocked or unavailable on this device.')
      setCameraActive(false)
    }
  }

  function stopCamera() {
    stopCameraStream()
    setCameraActive(false)
  }

  function capturePhoto() {
    if (!videoRef.current) {
      return
    }

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    updatePhoto(canvas.toDataURL('image/png'), canvas.width, canvas.height)
    stopCamera()
  }

  function onZoomChange(event) {
    const nextZoom = Number(event.target.value)
    setZoom(nextZoom)
    setOffset((currentOffset) => clampOffset(currentOffset, nextZoom, photoMeta))
  }

  function onOffsetSlider(axis, value) {
    const nextOffset = {
      ...offset,
      [axis]: Number(value),
    }

    setOffset(clampOffset(nextOffset))
  }

  function onPointerDown(event) {
    if (!photoMeta || !previewRef.current) {
      return
    }

    const bounds = previewRef.current.getBoundingClientRect()
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
      scaleRatio: bounds.width / FRAME_SIZE,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    const nextOffset = {
      x: dragState.startOffset.x + (event.clientX - dragState.startX) / dragState.scaleRatio,
      y: dragState.startOffset.y + (event.clientY - dragState.startY) / dragState.scaleRatio,
    }

    setOffset(clampOffset(nextOffset))
  }

  function onPointerUp(event) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  async function downloadComposite() {
    if (!photoSrc || !photoMeta || !frameRef.current || !photoRef.current) {
      return
    }

    setIsDownloading(true)

    try {
      const canvas = document.createElement('canvas')
      canvas.width = FRAME_SIZE
      canvas.height = FRAME_SIZE

      const context = canvas.getContext('2d')
      const drawWidth = photoMeta.width * photoMeta.baseScale * zoom
      const drawHeight = photoMeta.height * photoMeta.baseScale * zoom
      const drawX = PHOTO_CIRCLE.centerX - drawWidth / 2 + offset.x
      const drawY = PHOTO_CIRCLE.centerY - drawHeight / 2 + offset.y

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE)
      context.drawImage(photoRef.current, drawX, drawY, drawWidth, drawHeight)
      context.drawImage(frameRef.current, 0, 0, FRAME_SIZE, FRAME_SIZE)

      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = url
      link.download = 'framed-photo.png'
      link.click()
    } finally {
      setIsDownloading(false)
    }
  }

  const drawWidth = photoMeta ? photoMeta.width * photoMeta.baseScale * zoom : 0
  const drawHeight = photoMeta ? photoMeta.height * photoMeta.baseScale * zoom : 0
  const drawX = photoMeta ? PHOTO_CIRCLE.centerX - drawWidth / 2 + offset.x : 0
  const drawY = photoMeta ? PHOTO_CIRCLE.centerY - drawHeight / 2 + offset.y : 0
  const sliderLimitX = photoMeta ? Math.max((drawWidth - circleDiameter) / 2, 0) : 0
  const sliderLimitY = photoMeta ? Math.max((drawHeight - circleDiameter) / 2, 0) : 0

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(44,169,225,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,111,52,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] px-3 py-5 sm:px-4 sm:py-8 lg:px-6 lg:py-10">
      <section className="mx-auto w-full max-w-6xl">
        <div className="mb-5 sm:mb-7">
          <div className="max-w-3xl">
            <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral sm:text-xs">
              Picture Page
            </p>
            <h1 className="text-3xl font-black leading-[1.02] tracking-[-0.06em] text-brand-ink sm:text-5xl lg:text-2xl">
              Take or upload a photo, fit it inside the frame, and download it.
            </h1>
          </div>

          

          {cameraError ? (
            <p className="mt-3 text-sm text-red-700">{cameraError}</p>
          ) : null}
        </div>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-6">
          <div className="order-2 min-w-0 rounded-[22px] border border-brand-ink/12 bg-white/85 p-4 shadow-panel backdrop-blur md:rounded-[28px] md:p-6 lg:order-1">
            <div>
              <h2 className="text-lg font-bold text-brand-ink">Source</h2>
              <p className="mt-2 text-sm leading-6 text-brand-muted">
                Take a live photo or upload one from your gallery.
              </p>

              
            </div>

            {cameraActive ? (
              <div className="mt-5 rounded-3xl bg-[linear-gradient(160deg,#eef7ff_0%,#f8fbff_100%)] p-3 sm:p-4">
                <video
                  ref={videoRef}
                  className="block aspect-[4/3] w-full rounded-2xl bg-brand-surface object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <button className={primaryButtonClass} type="button" onClick={capturePhoto}>
                    Capture
                  </button>
                  <button className={ghostButtonClass} type="button" onClick={stopCamera}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid min-h-44 place-items-center rounded-3xl border border-dashed border-brand-ink/15 bg-[linear-gradient(160deg,#eef7ff_0%,#f8fbff_100%)] p-5 text-center sm:min-h-56 sm:p-6">
                <div>
                  <p className="text-sm font-semibold text-brand-ink sm:text-base">
                    {photoSrc ? 'Photo loaded and ready to frame.' : 'No picture selected yet.'}
                  </p>
                  <span className="mt-2 block text-sm text-brand-muted">
                    Choose upload or camera to get started.
                  </span>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap">
              <button
                className={primaryButtonClass}
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload Picture
              </button>
              <button
                className={secondaryButtonClass}
                type="button"
                onClick={cameraActive ? stopCamera : startCamera}
              >
                {cameraActive ? 'Stop Camera' : 'Take Picture'}
              </button>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="image/*"
                onChange={onFileChange}
              />
            </div>
          </div>

          <div className="order-1 min-w-0 rounded-[22px] border border-brand-ink/12 bg-white/85 p-4 shadow-panel backdrop-blur md:rounded-[28px] md:p-6 lg:order-2">
            <div>
              <h2 className="text-lg font-bold text-brand-ink">Frame Preview</h2>
              <p className="mt-2 text-sm leading-6 text-brand-muted">
                Drag the photo to reposition it. Use the sliders for fine adjustment.
              </p>
            </div>

            <div
              ref={previewRef}
              className="mt-5 rounded-[22px] bg-[linear-gradient(135deg,rgba(44,169,225,0.1),rgba(255,111,52,0.1)),#ffffff] p-2.5 sm:p-3 lg:p-4"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {photoSrc ? (
                <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-[18px] bg-[linear-gradient(135deg,rgba(44,169,225,0.14),rgba(255,111,52,0.12)),#ffffff] sm:rounded-[24px]">
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      ref={photoRef}
                      src={photoSrc}
                      alt="Selected preview"
                      className="absolute cursor-grab touch-none select-none object-cover active:cursor-grabbing"
                      style={{
                        width: `${(drawWidth / FRAME_SIZE) * 100}%`,
                        height: `${(drawHeight / FRAME_SIZE) * 100}%`,
                        left: `${(drawX / FRAME_SIZE) * 100}%`,
                        top: `${(drawY / FRAME_SIZE) * 100}%`,
                      }}
                      onPointerDown={onPointerDown}
                      draggable="false"
                    />
                  </div>
                  <img
                    ref={frameRef}
                    src={frameImage}
                    alt="Decorative picture frame"
                    className="relative z-10 block h-full w-full select-none pointer-events-none"
                    draggable="false"
                  />
                </div>
              ) : (
                <div className="relative mx-auto grid aspect-square w-full max-w-[640px] place-items-center overflow-hidden rounded-[18px] bg-[linear-gradient(135deg,rgba(44,169,225,0.14),rgba(255,111,52,0.12)),#ffffff] sm:rounded-[24px]">
                  <img
                    ref={frameRef}
                    src={frameImage}
                    alt="Decorative picture frame"
                    className="block h-full w-full select-none pointer-events-none"
                    draggable="false"
                  />
                  <p className="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-brand-ink/80 px-3 py-2 text-center text-xs text-white sm:inset-x-6 sm:bottom-6 sm:rounded-full sm:text-sm">
                    Preview appears here after you choose a picture.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">Zoom</span>
                <input
                  className="w-full accent-brand-sky"
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={onZoomChange}
                  disabled={!photoSrc}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">Horizontal</span>
                <input
                  className="w-full accent-brand-sky"
                  type="range"
                  min={-sliderLimitX}
                  max={sliderLimitX}
                  step="1"
                  value={offset.x}
                  onChange={(event) => onOffsetSlider('x', event.target.value)}
                  disabled={!photoSrc}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">Vertical</span>
                <input
                  className="w-full accent-brand-sky"
                  type="range"
                  min={-sliderLimitY}
                  max={sliderLimitY}
                  step="1"
                  value={offset.y}
                  onChange={(event) => onOffsetSlider('y', event.target.value)}
                  disabled={!photoSrc}
                />
              </label>
            </div>

            <button
              className={`${primaryButtonClass} mt-5 w-full`}
              type="button"
              onClick={downloadComposite}
              disabled={!photoSrc || isDownloading}
            >
              {isDownloading ? 'Preparing Download...' : 'Download Framed Picture'}
            </button>
          </div>
        </section>
      </section>
    </main>
  )
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default App
