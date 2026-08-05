import { useEffect, useRef, useState } from 'react'
import frameImage from '../assets/test-frame.png'
import { isFirestoreReady, saveImageRecord } from './lib/firebase'

const FRAME_SIZE = 1200
const GOOGLE_SCOPE =
  'openid email profile https://www.googleapis.com/auth/drive.file'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GOOGLE_DRIVE_FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
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
const allowedEmailDomain = 'dswd.gov.ph'
const storedUserKey = 'photo-frame-user'

function App() {
  const [photoSrc, setPhotoSrc] = useState('')
  const [photoMeta, setPhotoMeta] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState('')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [googleReady, setGoogleReady] = useState(false)
  const [user, setUser] = useState(null)
  const [authError, setAuthError] = useState('')

  const frameRef = useRef(null)
  const photoRef = useRef(null)
  const fileInputRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const videoRef = useRef(null)
  const previewRef = useRef(null)
  const streamRef = useRef(null)
  const dragStateRef = useRef(null)
  const tokenClientRef = useRef(null)
  const accessTokenRef = useRef('')

  const circleDiameter = PHOTO_CIRCLE.radius * 2

  useEffect(() => {
    const storedUser = readStoredUser()

    if (storedUser) {
      setUser(storedUser)
    }
  }, [])

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

  useEffect(() => {
    if (!previewCanvasRef.current || !frameRef.current || !photoRef.current || !photoMeta) {
      return
    }

    const canvas = previewCanvasRef.current
    canvas.width = FRAME_SIZE
    canvas.height = FRAME_SIZE

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    drawComposite(context, photoRef.current, frameRef.current, photoMeta, zoom, offset)
  }, [photoMeta, zoom, offset, photoSrc])

  useEffect(() => {
    let cancelled = false

    async function setupGoogle() {
      if (!GOOGLE_CLIENT_ID) {
        setDownloadMessage('Missing VITE_GOOGLE_CLIENT_ID in .env.')
        return
      }

      try {
        await loadGoogleIdentityScript()

        if (cancelled) {
          return
        }

        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPE,
          callback: () => {},
          error_callback: (error) => {
            if (error?.type === 'popup_failed_to_open' || error?.type === 'popup_closed') {
              setAuthError('Google sign-in popup was blocked or closed.')
              return
            }

            setAuthError('Google sign-in could not be started.')
          },
        })

        setGoogleReady(true)
      } catch {
        setDownloadMessage('Google sign-in could not be loaded.')
      }
    }

    setupGoogle()

    return () => {
      cancelled = true
    }
  }, [])

  async function signInWithGoogle() {
    if (!tokenClientRef.current) {
      setAuthError('Google sign-in is not ready yet.')
      return
    }

    setAuthError('')

    try {
      const token = await getGoogleAccessToken(tokenClientRef.current, '', null, {
        prompt: 'consent',
        hd: allowedEmailDomain,
      })
      const profile = await fetchGoogleUserProfile(token)
      const email = profile.email?.toLowerCase?.() || ''
      const hostedDomain = profile.hd?.toLowerCase?.() || ''
      const isAllowedDomain =
        hostedDomain === allowedEmailDomain || email.endsWith(`@${allowedEmailDomain}`)

      if (!profile.email_verified || !isAllowedDomain) {
        setUser(null)
        accessTokenRef.current = ''
        clearStoredUser()
        setAuthError(`Please sign in with a ${allowedEmailDomain} Google account.`)
        return
      }

      setAuthError('')
      setDownloadMessage('')
      accessTokenRef.current = token
      setUser(profile)
      writeStoredUser(profile)
      setDownloadMessage('Google Drive access is ready.')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Google sign-in failed.')
    }
  }

  useEffect(() => {
    if (!googleReady || !user || accessTokenRef.current || !tokenClientRef.current) {
      return
    }

    void restoreDriveSession(user)
  }, [googleReady, user])

  async function restoreDriveSession(currentUser) {
    try {
      const token = await getGoogleAccessToken(tokenClientRef.current, '', currentUser, {
        prompt: 'none',
        hd: allowedEmailDomain,
      })

      accessTokenRef.current = token
    } catch {
      accessTokenRef.current = ''
    }
  }

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

    if (!GOOGLE_DRIVE_FOLDER_ID) {
      setDownloadMessage('Missing VITE_GOOGLE_DRIVE_FOLDER_ID in .env.')
      return
    }

    if (!user) {
      setDownloadMessage(`Please sign in with your ${allowedEmailDomain} account first.`)
      return
    }

    if (!tokenClientRef.current) {
      setDownloadMessage('Google sign-in is not ready yet.')
      return
    }

    setIsDownloading(true)
    setDownloadMessage('')
    setDownloadProgress(0)

    try {
      setDownloadMessage('Preparing image...')
      setDownloadProgress(10)

      const canvas = document.createElement('canvas')
      canvas.width = FRAME_SIZE
      canvas.height = FRAME_SIZE

      const context = canvas.getContext('2d')
      drawComposite(context, photoRef.current, frameRef.current, photoMeta, zoom, offset)

      setDownloadMessage('Compressing image...')
      setDownloadProgress(15)
      const compressedFile = await renderCompressedImageFile(canvas, user)
      const { fileName, blob, mimeType } = compressedFile
      const previewDataUrl = renderPreviewDataUrl(canvas, 96)
      setDownloadMessage('Checking Google Drive access...')
      setDownloadProgress(20)
      const token = await getGoogleAccessToken(
        tokenClientRef.current,
        accessTokenRef.current,
        user,
      )
      accessTokenRef.current = token
      setDownloadMessage('Uploading to Google Drive...')
      setDownloadProgress(30)
      const driveFile = await uploadToDrive(
        token,
        fileName,
        blob,
        GOOGLE_DRIVE_FOLDER_ID,
        (progress) => {
          setDownloadProgress(Math.max(30, Math.min(85, 30 + progress * 0.55)))
        },
      )

      if (isFirestoreReady()) {
        setDownloadMessage('Saving image record...')
        setDownloadProgress(90)
        await saveImageRecord({
          driveFileId: driveFile?.id || '',
          driveFileName: driveFile?.name || fileName,
          driveWebViewLink: driveFile?.webViewLink || '',
          drivePreviewUrl: driveFile?.id
            ? `https://drive.google.com/thumbnail?id=${driveFile.id}&sz=w960`
            : '',
          driveParadeUrl: driveFile?.id
            ? `https://drive.google.com/thumbnail?id=${driveFile.id}&sz=w512`
            : '',
          previewDataUrl,
          fileName,
          mimeType,
          uploadedByName: user?.name || '',
          uploadedByEmail: user?.email || '',
        })
      }

      setDownloadMessage('Downloading image...')
      setDownloadProgress(97)
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
      setDownloadProgress(100)
      setDownloadMessage('Downloaded and uploaded to Google Drive.')
    } catch (error) {
      setDownloadMessage(error instanceof Error ? error.message : 'Download failed.')
    } finally {
      setIsDownloading(false)
    }
  }

  const drawWidth = photoMeta ? photoMeta.width * photoMeta.baseScale * zoom : 0
  const drawHeight = photoMeta ? photoMeta.height * photoMeta.baseScale * zoom : 0
  const sliderLimitX = photoMeta ? Math.max((drawWidth - circleDiameter) / 2, 0) : 0
  const sliderLimitY = photoMeta ? Math.max((drawHeight - circleDiameter) / 2, 0) : 0

  if (!user) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(44,169,225,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,111,52,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] px-3 py-5 sm:px-4 sm:py-8 lg:px-6 lg:py-10">
        <section className="mx-auto flex min-h-[80vh] w-full max-w-6xl items-center justify-center">
          <div className="w-full max-w-md rounded-[28px] border border-brand-ink/12 bg-white/90 p-6 text-center shadow-panel backdrop-blur md:p-8">
            <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral sm:text-xs">
              DSWD Access
            </p>
            <h1 className="text-3xl font-black leading-[1.02] tracking-[-0.06em] text-brand-ink">
              Sign in before opening the photo frame
            </h1>
            <p className="mt-3 text-sm leading-6 text-brand-muted">
              Access is limited to Google accounts under {allowedEmailDomain}.
            </p>
            <div className="mt-6 flex justify-center">
              <button
                className={secondaryButtonClass}
                type="button"
                onClick={signInWithGoogle}
                disabled={!googleReady}
              >
                Sign in with Google
              </button>
            </div>
            {authError ? <p className="mt-4 text-sm text-red-700">{authError}</p> : null}
            {!googleReady ? (
              <p className="mt-4 text-sm text-brand-muted">Loading Google sign-in...</p>
            ) : null}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(44,169,225,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,111,52,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] px-3 py-5 sm:px-4 sm:py-8 lg:px-6 lg:py-10">
      {isDownloading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-brand-ink/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/50 bg-white/95 p-6 shadow-[0_35px_100px_rgba(13,43,69,0.25)]">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral">
              Upload In Progress
            </p>
            <p className="mt-3 text-2xl font-black leading-tight text-brand-ink">
              Please wait while we save your image.
            </p>
            <div className="mt-5 overflow-hidden rounded-full bg-brand-ink/10">
              <div
                className="h-3 rounded-full bg-brand-sky transition-[width] duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-brand-muted">
              <span>{downloadMessage || 'Working...'}</span>
              <span>{Math.round(downloadProgress)}%</span>
            </div>
          </div>
        </div>
      ) : null}
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
          <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-brand-ink/10 bg-white/70 px-4 py-3 text-sm text-brand-ink sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.email}
                  className="h-10 w-10 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div>
                <p className="font-semibold">{user.name}</p>
                <p className="text-brand-muted">{user.email}</p>
              </div>
            </div>
            <button
              className={ghostButtonClass}
              type="button"
              onClick={() => {
                setUser(null)
                setAuthError('')
                accessTokenRef.current = ''
                clearStoredUser()
              }}
            >
              Sign Out
            </button>
            <a
              className="inline-flex items-center justify-center rounded-full bg-brand-sky px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              href="/photo-frame/images"
            >
              Images Page
            </a>
            <a
              className="inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5"
              href="/photo-frame/admin"
            >
              Admin
            </a>
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
                  <canvas
                    ref={previewCanvasRef}
                    className="block h-full w-full"
                  />
                  <img
                    ref={photoRef}
                    src={photoSrc}
                    alt="Selected preview source"
                    className="hidden"
                    draggable="false"
                  />
                  <img
                    ref={frameRef}
                    src={frameImage}
                    alt="Decorative picture frame source"
                    className="hidden"
                    draggable="false"
                  />
                  <div
                    className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
                    onPointerDown={onPointerDown}
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
              disabled={!photoSrc || isDownloading || !googleReady}
            >
              {isDownloading ? 'Uploading and Downloading...' : 'Download Framed Picture'}
            </button>
            {downloadMessage ? (
              <p className="mt-3 text-sm text-brand-ink">{downloadMessage}</p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  )
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function drawComposite(context, photoImage, frameImageEl, photoMeta, zoom, offset) {
  if (!context || !photoImage || !frameImageEl || !photoMeta) {
    return
  }

  const drawWidth = photoMeta.width * photoMeta.baseScale * zoom
  const drawHeight = photoMeta.height * photoMeta.baseScale * zoom
  const drawX = PHOTO_CIRCLE.centerX - drawWidth / 2 + offset.x
  const drawY = PHOTO_CIRCLE.centerY - drawHeight / 2 + offset.y

  context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE)
  context.drawImage(photoImage, drawX, drawY, drawWidth, drawHeight)
  context.drawImage(frameImageEl, 0, 0, FRAME_SIZE, FRAME_SIZE)
}

function buildDownloadFileName(user, extension = 'webp') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'framed-photo'
  const safeName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${safeName || 'framed-photo'}-${timestamp}.${extension}`
}

function readStoredUser() {
  try {
    const rawValue = window.localStorage.getItem(storedUserKey)

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)
    const email = parsedValue?.email?.toLowerCase?.() || ''

    if (!email.endsWith(`@${allowedEmailDomain}`)) {
      clearStoredUser()
      return null
    }

    return {
      name: parsedValue.name || email,
      email,
      picture: parsedValue.picture || '',
      sub: parsedValue.sub || '',
    }
  } catch {
    clearStoredUser()
    return null
  }
}

function writeStoredUser(user) {
  window.localStorage.setItem(storedUserKey, JSON.stringify(user))
}

function clearStoredUser() {
  window.localStorage.removeItem(storedUserKey)
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-identity="true"]')

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleIdentity = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'))
    document.head.appendChild(script)
  })
}

function getGoogleAccessToken(tokenClient, existingToken, user, overrides = {}) {
  if (existingToken) {
    return Promise.resolve(existingToken)
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error))
        return
      }

      resolve(response.access_token)
    }

    tokenClient.requestAccessToken({
      prompt: '',
      login_hint: user?.email || user?.sub || undefined,
      hd: allowedEmailDomain,
      ...overrides,
    })
  })
}

async function fetchGoogleUserProfile(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Could not load Google account details.')
  }

  const payload = await response.json()

  return {
    name: payload.name || payload.email || '',
    email: payload.email?.toLowerCase?.() || '',
    picture: payload.picture || '',
    sub: payload.sub || '',
    hd: payload.hd?.toLowerCase?.() || '',
    email_verified: Boolean(payload.email_verified),
  }
}

function renderCanvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not create image file.'))
        return
      }

      resolve(blob)
    }, type, quality)
  })
}

async function renderCompressedImageFile(canvas, user) {
  const formatCandidates = [
    { mimeType: 'image/webp', extension: 'webp', quality: 0.88 },
    { mimeType: 'image/jpeg', extension: 'jpg', quality: 0.9 },
    { mimeType: 'image/png', extension: 'png' },
  ]

  for (const format of formatCandidates) {
    try {
      const blob = await renderCanvasToBlob(canvas, format.mimeType, format.quality)

      if (blob && blob.size > 0) {
        return {
          blob,
          fileName: buildDownloadFileName(user, format.extension),
          mimeType: format.mimeType,
        }
      }
    } catch {
      continue
    }
  }

  throw new Error('Could not compress the image file.')
}

function renderPreviewDataUrl(sourceCanvas, size) {
  const previewCanvas = document.createElement('canvas')
  previewCanvas.width = size
  previewCanvas.height = size

  const context = previewCanvas.getContext('2d')

  if (!context) {
    return ''
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.drawImage(sourceCanvas, 0, 0, size, size)

  return previewCanvas.toDataURL('image/jpeg', 0.7)
}

function uploadToDrive(accessToken, fileName, blob, folderId, onProgress) {
  const metadata = {
    name: fileName,
    parents: [folderId],
  }

  const formData = new FormData()
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  )
  formData.append('file', blob, fileName)

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(
      'POST',
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    )
    request.responseType = 'json'
    request.timeout = 30000
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`)

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response || {})
        return
      }

      const errorMessage =
        request.response?.error?.message ||
        request.response?.message ||
        'Upload failed.'
      reject(new Error(errorMessage))
    }

    request.onerror = () => {
      reject(new Error('Upload failed because the network request did not complete.'))
    }

    request.ontimeout = () => {
      reject(new Error('Upload timed out while sending the image to Google Drive.'))
    }

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== 'function') {
        return
      }

      onProgress((event.loaded / event.total) * 100)
    }

    request.send(formData)
  })
}

export default App
