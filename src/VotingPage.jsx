import { useEffect, useMemo, useRef, useState } from 'react'
import heartButtonImage from '../assets/heart.jpg'
import { incrementImageHeart, subscribeToImageRecords } from './lib/firebase'
import { getDisplayImageUrl, getHeartCount } from './lib/imageRecords'

const swipeThreshold = 90
const swipeOutDurationMs = 320
const recentHistoryLimit = 6
const heartBurstOffsets = [
  { x: -72, y: -72, rotate: -18, delay: '0ms' },
  { x: -36, y: -108, rotate: -8, delay: '50ms' },
  { x: 0, y: -124, rotate: 0, delay: '90ms' },
  { x: 40, y: -104, rotate: 10, delay: '130ms' },
  { x: 76, y: -70, rotate: 18, delay: '180ms' },
]

function VotingPage() {
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentImageId, setCurrentImageId] = useState('')
  const [recentIds, setRecentIds] = useState([])
  const [dragX, setDragX] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState('')
  const [heartBurstToken, setHeartBurstToken] = useState(0)
  const [heartTapToken, setHeartTapToken] = useState(0)
  const [floatingHearts, setFloatingHearts] = useState([])

  const pointerStateRef = useRef({
    pointerId: null,
    startX: 0,
    currentX: 0,
    isDragging: false,
  })
  const cardStageRef = useRef(null)

  useEffect(() => {
    setIsLoading(true)
    setErrorMessage('')

    return subscribeToImageRecords(
      (records) => {
        setImages(records)
        setIsLoading(false)
      },
      (error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load images.')
        setIsLoading(false)
      },
    )
  }, [])

  const currentImage = useMemo(
    () => images.find((image) => image.id === currentImageId) || null,
    [currentImageId, images],
  )
  const nextImage = useMemo(() => getRandomImage(images, currentImageId, recentIds), [
    currentImageId,
    images,
    recentIds,
  ])

  useEffect(() => {
    if (images.length === 0) {
      setCurrentImageId('')
      return
    }

    if (!currentImageId || !images.some((image) => image.id === currentImageId)) {
      const fallbackImage = getRandomImage(images, '', recentIds) || images[0]
      setCurrentImageId(fallbackImage?.id || '')
    }
  }, [currentImageId, images, recentIds])

  useEffect(() => {
    if (floatingHearts.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setFloatingHearts((current) => current.slice(1))
    }, 720)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [floatingHearts])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousTouchAction = document.body.style.touchAction
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlTouchAction = document.documentElement.style.touchAction

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.touchAction = 'none'

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.touchAction = previousTouchAction
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.touchAction = previousHtmlTouchAction
    }
  }, [])

  function completeSwipe(nextId) {
    if (!nextId) {
      return
    }

    setRecentIds((current) => [...current.slice(-(recentHistoryLimit - 1)), nextId])
    setCurrentImageId(nextId)
    setDragX(0)
    setSwipeDirection('')
  }

  function startSwipeOut(direction) {
    if (!currentImage) {
      return
    }

    const upcomingImage = nextImage || getRandomImage(images, currentImageId, recentIds)

    if (!upcomingImage) {
      return
    }

    const stageWidth = cardStageRef.current?.offsetWidth || window.innerWidth || 320
    const swipeDistance = Math.max(stageWidth * 1.1, 260)

    setSwipeDirection(direction)
    setDragX(direction === 'right' ? swipeDistance : -swipeDistance)

    window.setTimeout(() => {
      completeSwipe(upcomingImage.id)
    }, swipeOutDurationMs)
  }

  function handlePointerDown(event) {
    if (!currentImage || swipeDirection) {
      return
    }

    pointerStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      currentX: event.clientX,
      isDragging: true,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event) {
    if (!pointerStateRef.current.isDragging || pointerStateRef.current.pointerId !== event.pointerId) {
      return
    }

    pointerStateRef.current.currentX = event.clientX
    setDragX(event.clientX - pointerStateRef.current.startX)
  }

  function handlePointerEnd(event) {
    if (!pointerStateRef.current.isDragging || pointerStateRef.current.pointerId !== event.pointerId) {
      return
    }

    const finalDragX = pointerStateRef.current.currentX - pointerStateRef.current.startX

    pointerStateRef.current = {
      pointerId: null,
      startX: 0,
      currentX: 0,
      isDragging: false,
    }

    if (Math.abs(finalDragX) >= swipeThreshold) {
      startSwipeOut(finalDragX > 0 ? 'right' : 'left')
      return
    }

    setDragX(0)
  }

  function handleHeart() {
    if (!currentImage) {
      return
    }

    const token = Date.now()

    setHeartTapToken(token)
    setHeartBurstToken(token)
    setFloatingHearts((current) => [...current, token])

    incrementImageHeart(currentImage.id).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not add a heart.')
    })
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7d9e2_0%,#f3f4f6_28%,#e9edf5_100%)] px-4 py-5 text-[#162033] sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-5xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-[24px] border border-white/70 bg-white/78 px-4 py-4 shadow-[0_16px_40px_rgba(27,39,65,0.08)] backdrop-blur sm:px-6">
          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
              href="/photo-frame/images"
            >
              <span>{'\u2039'}</span>
              Back
            </a>
            <a
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
              href="/photo-frame/leaderboard"
            >
              Leaderboard
            </a>
          </div>
          <div className="text-right">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-slate-400">
              Voting
            </p>
            <p className="text-sm font-semibold text-slate-600">Swipe or tap to react</p>
          </div>
        </header>

        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {isLoading ? (
          <section className="grid flex-1 place-items-center rounded-[28px] border border-white/70 bg-white/72 shadow-[0_20px_48px_rgba(27,39,65,0.08)]">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
              <p className="text-sm text-slate-500">Loading voting board...</p>
            </div>
          </section>
        ) : images.length === 0 || !currentImage ? (
          <section className="grid flex-1 place-items-center rounded-[28px] border border-white/70 bg-white/72 p-8 text-center shadow-[0_20px_48px_rgba(27,39,65,0.08)]">
            <div>
              <p className="text-sm text-slate-500">No images available yet.</p>
              <a
                className="mt-5 inline-flex items-center justify-center rounded-full bg-[#ef4444] px-6 py-3 text-sm font-semibold text-white"
                href="/photo-frame/"
              >
                Open the photo booth
              </a>
            </div>
          </section>
        ) : (
          <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[30px] border border-white/70 bg-white/76 p-4 shadow-[0_22px_56px_rgba(27,39,65,0.1)] backdrop-blur sm:p-5">
              <div className="relative mx-auto w-full max-w-[640px]">
                <div ref={cardStageRef} className="relative">
                {nextImage ? (
                  <>
                    <div
                      className="pointer-events-none absolute inset-x-5 top-5 aspect-square rounded-[24px] border border-slate-200/80 bg-white/75 shadow-[0_18px_36px_rgba(27,39,65,0.08)]"
                      style={{
                        transform: `translateX(${dragX > 0 ? -32 : 32}px) scale(${0.97 + Math.min(Math.abs(dragX) / 1800, 0.015)})`,
                        opacity: 0.7 + Math.min(Math.abs(dragX) / 900, 0.12),
                      }}
                    >
                      <img
                        src={getDisplayImageUrl(nextImage)}
                        alt=""
                        className="h-full w-full rounded-[24px] object-contain opacity-12"
                        aria-hidden="true"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-4 top-4 aspect-square rounded-[24px] border border-slate-200/80 bg-white/85 shadow-[0_20px_40px_rgba(27,39,65,0.08)]"
                      style={{
                        transform: `translateX(${dragX > 0 ? -14 : 14}px) scale(${0.985 + Math.min(Math.abs(dragX) / 1600, 0.02)})`,
                        opacity: 0.86 + Math.min(Math.abs(dragX) / 1000, 0.1),
                      }}
                    >
                      <img
                        src={getDisplayImageUrl(nextImage)}
                        alt=""
                        className="h-full w-full rounded-[24px] object-contain opacity-25"
                        aria-hidden="true"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </>
                ) : null}

                <article
                  className="relative aspect-square w-full overflow-hidden rounded-[26px] border border-slate-200 bg-[#f7f7fa] shadow-[0_18px_42px_rgba(27,39,65,0.08)]"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  style={{
                    transform: `translateX(${dragX}px) scale(${swipeDirection ? 0.985 : 1})`,
                    transition: pointerStateRef.current.isDragging
                      ? 'none'
                      : `transform ${swipeOutDurationMs}ms cubic-bezier(0.22,1,0.36,1)`,
                    touchAction: 'pan-y',
                  }}
                >
                  <img
                    src={getDisplayImageUrl(currentImage)}
                    alt={currentImage.driveFileName || currentImage.fileName || 'Voting image'}
                    className="h-full w-full object-contain"
                    draggable="false"
                    referrerPolicy="no-referrer"
                  />

                  <div
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
                      dragX > 45 ? 'opacity-100' : 'opacity-0'
                    } bg-[linear-gradient(90deg,rgba(255,92,138,0.14),transparent_36%)]`}
                  />
                  <div
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
                      dragX < -45 ? 'opacity-100' : 'opacity-0'
                    } bg-[linear-gradient(270deg,rgba(66,153,225,0.14),transparent_36%)]`}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(22,32,51,0.12))]"
                    style={{
                      opacity: Math.min(Math.abs(dragX) / 180, 1),
                      transform: `translateX(${dragX * 0.08}px)`,
                    }}
                  />

                  {getHeartCount(currentImage) > 0 ? (
                    <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-black/72 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
                      <span className="text-[#ff6c96] animate-[heartBadgePulse_1.8s_ease-in-out_infinite]">
                        {'\u2665'}
                      </span>
                      <span>{getHeartCount(currentImage)}</span>
                    </div>
                  ) : null}

                  {floatingHearts.map((token) => (
                    <span
                      key={token}
                      className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 text-5xl text-[#ff5c8a] animate-[floatHeart_720ms_cubic-bezier(0.2,0.9,0.25,1)_forwards]"
                    >
                      {'\u2665'}
                    </span>
                  ))}

                  <div
                    key={heartBurstToken}
                    className={`pointer-events-none absolute inset-0 z-20 ${heartBurstToken ? 'opacity-100' : 'opacity-0'}`}
                  >
                    {heartBurstOffsets.map((offset, index) => (
                      <span
                        key={`${heartBurstToken}-${index}`}
                        className="absolute left-1/2 top-1/2 text-3xl text-[#ffd35c] opacity-0 animate-[heartBurst_700ms_cubic-bezier(0.16,0.84,0.32,1)_forwards]"
                        style={{
                          '--burst-x': `${offset.x}px`,
                          '--burst-y': `${offset.y}px`,
                          '--burst-rotate': `${offset.rotate}deg`,
                          animationDelay: offset.delay,
                        }}
                      >
                        {index % 2 === 0 ? '\u2665' : '\u2726'}
                      </span>
                    ))}
                  </div>
                </article>
                </div>
              </div>
            </div>

            <aside className="flex flex-col gap-5">
              <div className="rounded-[28px] border border-white/70 bg-white/78 p-5 shadow-[0_20px_48px_rgba(27,39,65,0.08)] backdrop-blur">
                <div className="mt-4 rounded-[20px] bg-[#f6f7fb] px-4 py-3 text-center">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Hearts
                  </p>
                  <p className="mt-2 text-4xl font-black leading-none text-slate-900">
                    {getHeartCount(currentImage)}
                  </p>
                </div>

                <center>
                  <button
                  className="mt-5 inline-flex h-[96px] w-[96px] items-center justify-center self-center overflow-hidden rounded-full border-4 border-white shadow-[0_22px_42px_rgba(245,52,97,0.24)] transition hover:scale-[1.03] active:scale-[0.98]"
                  type="button"
                  onClick={handleHeart}
                  aria-label="Heart image"
                >
                  <img
                    key={`footer-heart-${heartTapToken}`}
                    src={heartButtonImage}
                    alt=""
                    className={`h-full w-full object-cover ${heartTapToken ? 'animate-[heartButtonPop_460ms_ease]' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                </center>

                <p className="mt-4 text-center text-sm font-semibold text-slate-600">
                  Tap the heart as many times as you want
                </p>
              </div>
            </aside>
          </section>
        )}
      </section>
    </main>
  )
}

function getRandomImage(images, currentImageId, recentIds) {
  if (images.length === 0) {
    return null
  }

  if (images.length === 1) {
    return images[0]
  }

  const freshPool = images.filter(
    (image) => image.id !== currentImageId && !recentIds.includes(image.id),
  )
  const fallbackPool = images.filter((image) => image.id !== currentImageId)
  const pool = freshPool.length > 0 ? freshPool : fallbackPool

  return pool[Math.floor(Math.random() * pool.length)] || null
}

export default VotingPage
