import { useEffect, useMemo, useRef, useState } from 'react'
import dswdImage from './assets/dswd.jpg'
import { subscribeToImageRecords } from './lib/firebase'

const carouselIntervalMs = 5000
const paradeDurationMs = 8000
const spotlightDurationMs = 5000
const slideSize = 2
const preloadConcurrency = 3
const carouselPreloadSlideWindow = 3
const paradePreloadCount = 16
const paradeLoopWindow = 18
const cardAnimations = [
  'cardFloat',
  'cardJump',
  'cardStretch',
  'cardSwing',
  'cardPulseTilt',
]

function ImagesPage() {
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeSlide, setActiveSlide] = useState(0)
  const [loadedUrls, setLoadedUrls] = useState({})
  const [isParadeMode, setIsParadeMode] = useState(false)
  const [isSpotlightMode, setIsSpotlightMode] = useState(false)
  const [isPreparingParade, setIsPreparingParade] = useState(false)

  const preloadQueueRef = useRef([])
  const activeLoadsRef = useRef(0)
  const requestedUrlsRef = useRef(new Set())

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

  const slides = useMemo(() => chunkImages(images, slideSize), [images])
  const canRunParade = images.length > slideSize

  const paradeImages = useMemo(() => {
    if (images.length === 0) {
      return []
    }

    const baseImages = images.slice(-Math.min(images.length, paradeLoopWindow))
    return [...baseImages, ...baseImages]
  }, [images])

  const prioritizedUrls = useMemo(() => {
    if (slides.length === 0) {
      return []
    }

    if (isParadeMode || isPreparingParade) {
      return [
        ...new Set(
          images
            .slice(-Math.min(images.length, paradePreloadCount))
            .map((image) => getParadeImageUrl(image))
            .filter(Boolean),
        ),
      ]
    }

    const slideIndexes = []

    for (let offset = -1; offset <= carouselPreloadSlideWindow - 2; offset += 1) {
      const index = activeSlide + offset

      if (index < 0 || index >= slides.length) {
        continue
      }

      slideIndexes.push(index)
    }

    return [
      ...new Set(
        slideIndexes
          .flatMap((slideIndex) => slides[slideIndex] || [])
          .map((image) => getDisplayImageUrl(image))
          .filter(Boolean),
      ),
    ]
  }, [activeSlide, images, isParadeMode, isPreparingParade, slides])

  useEffect(() => {
    prioritizedUrls.forEach((url) => {
      if (loadedUrls[url] !== undefined || requestedUrlsRef.current.has(url)) {
        return
      }

      requestedUrlsRef.current.add(url)
      preloadQueueRef.current.push(url)
    })

    pumpPreloadQueue(
      preloadQueueRef,
      activeLoadsRef,
      preloadConcurrency,
      setLoadedUrls,
    )
  }, [loadedUrls, prioritizedUrls])

  useEffect(() => {
    if (slides.length <= 1 || isParadeMode || isSpotlightMode) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => {
        if (current >= slides.length - 1) {
          if (canRunParade) {
            setIsPreparingParade(true)
            setIsSpotlightMode(true)
            return current
          }

          return 0
        }

        return current + 1
      })
    }, carouselIntervalMs)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [slides.length, isParadeMode, isSpotlightMode, canRunParade])

  useEffect(() => {
    if (activeSlide > slides.length - 1) {
      setActiveSlide(0)
    }
  }, [activeSlide, slides.length])

  useEffect(() => {
    if (!isParadeMode) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsParadeMode(false)
      setIsSpotlightMode(true)
    }, paradeDurationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isParadeMode])

  useEffect(() => {
    if (!isSpotlightMode) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (isPreparingParade) {
        setIsSpotlightMode(false)
        setIsPreparingParade(false)
        setIsParadeMode(true)
        return
      }

      setIsSpotlightMode(false)
      setActiveSlide(0)
    }, spotlightDurationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isPreparingParade, isSpotlightMode])

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(44,169,225,0.12),transparent_20%),radial-gradient(circle_at_bottom_right,rgba(255,111,52,0.12),transparent_18%),linear-gradient(145deg,#eef5ff_0%,#dfe9ff_30%,#f7fbff_100%)]">
      <section className="relative min-h-screen">
        <a
          className="absolute left-4 top-4 z-30 inline-flex items-center justify-center rounded-full bg-white/75 px-4 py-2 text-sm font-semibold text-brand-ink shadow-[0_18px_40px_rgba(13,43,69,0.14)] backdrop-blur transition hover:-translate-y-0.5 md:left-6 md:top-6"
          href="/photo-frame/"
        >
          Back
        </a>

        {isLoading ? (
          <section className="grid min-h-screen place-items-center">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-brand-sky/20 border-t-brand-sky" />
          </section>
        ) : errorMessage ? (
          <section className="grid min-h-screen place-items-center px-6 text-center text-red-700">
            {errorMessage}
          </section>
        ) : slides.length === 0 ? (
          <SpotlightPanel />
        ) : isParadeMode ? (
          <section className="relative min-h-screen overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.55),transparent_38%),radial-gradient(circle_at_top,rgba(44,169,225,0.12),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,111,52,0.14),transparent_24%)]" />
            <div className="relative flex min-h-screen flex-col justify-center gap-5 overflow-hidden px-4 py-10 md:gap-7 md:px-8">
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={`row-${row}`}
                  className={`flex min-w-max gap-4 will-change-transform ${row % 2 === 0 ? 'animate-[marquee_22s_linear_infinite]' : 'animate-[marqueeReverse_26s_linear_infinite]'}`}
                >
                  {paradeImages.map((image, index) => {
                    const displayUrl = getParadeImageUrl(image)
                    const blurUrl = getBlurImageUrl(image)
                    const isLoaded = loadedUrls[displayUrl]

                    return (
                      <article
                        key={`parade-${row}-${image.id}-${index}`}
                        className="relative h-32 w-32 shrink-0 overflow-hidden rounded-[18px] border border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(13,43,69,0.18)] md:h-44 md:w-44 lg:h-52 lg:w-52"
                        style={{
                          transform: `perspective(1200px) rotateY(${row % 2 === 0 ? '-10deg' : '10deg'}) rotateZ(${((index + row) % 7) - 3}deg) translateY(${((index + row) % 4) * 8}px)`,
                        }}
                      >
                        <div className="absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.22),transparent_18%,transparent_82%,rgba(13,43,69,0.18))]" />
                        {blurUrl ? (
                          <img
                            src={blurUrl}
                            alt=""
                            className={`absolute inset-0 h-full w-full bg-white object-contain p-2 transition duration-500 ${
                              isLoaded ? 'scale-105 opacity-0 blur-xl' : 'opacity-100 blur-md'
                            }`}
                            aria-hidden="true"
                          />
                        ) : null}
                        {isLoaded ? (
                          <img
                            src={displayUrl}
                            alt={image.driveFileName || image.fileName || 'Uploaded image'}
                            className="h-full w-full bg-white object-contain p-2"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,#eef5ff_0%,#ddeaff_100%)]">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-sky/20 border-t-brand-sky" />
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : isSpotlightMode ? (
          <SpotlightPanel />
        ) : (
          <>
            <section className="relative min-h-screen overflow-hidden px-4 py-16 md:px-8 md:py-20">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.5),transparent_40%)]" />
              <div
                className="relative flex h-full transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: `translateX(-${activeSlide * 100}%)` }}
              >
                {slides.map((slide, slideIndex) => (
                  <div
                    key={`slide-${slideIndex}`}
                    className="grid min-w-full place-items-center gap-6 md:grid-cols-2 md:gap-10"
                  >
                    {slide.map((image, imageIndex) => {
                      const displayUrl = getDisplayImageUrl(image)
                      const blurUrl = getBlurImageUrl(image)
                      const isLoaded = loadedUrls[displayUrl]
                      const isActive = slideIndex === activeSlide
                      const rotation = imageIndex === 0 ? '-5deg' : '5deg'
                      const animationName =
                        cardAnimations[(slideIndex * slideSize + imageIndex) % cardAnimations.length]

                      return (
                        <article
                          key={image.id}
                          className={`group relative w-full max-w-[42rem] overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-[0_40px_90px_rgba(13,43,69,0.2)] transition-[transform,opacity,filter,box-shadow] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            isActive ? 'opacity-100 blur-0' : 'opacity-35 blur-[1px]'
                          }`}
                          style={{
                            aspectRatio: '1 / 1',
                            transform: isActive
                              ? `perspective(1200px) rotateY(0deg) rotateZ(${rotation}) translateY(0) scale(1)`
                              : `perspective(1200px) rotateY(${imageIndex === 0 ? '-20deg' : '20deg'}) rotateZ(${rotation}) translateY(30px) scale(0.92)`,
                            transitionDelay: `${imageIndex * 140}ms`,
                            animation: isActive
                              ? `cardEntrance 1100ms cubic-bezier(0.22,1,0.36,1) ${imageIndex * 140}ms both, ${animationName} ${imageIndex === 0 ? '4.8s' : '5.4s'} ease-in-out ${1100 + imageIndex * 140}ms infinite`
                              : 'none',
                          }}
                        >
                          <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_40%)]" />
                          <div className="absolute inset-[10px] z-10 rounded-[20px] border border-white/35" />
                          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(120deg,transparent_18%,rgba(255,255,255,0.32)_40%,transparent_62%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:animate-[cardShine_1.15s_ease]" />
                          <div className="relative h-full w-full bg-[radial-gradient(circle_at_top,rgba(44,169,225,0.18),transparent_38%),linear-gradient(180deg,#eef5ff_0%,#ddeaff_100%)]">
                            {blurUrl ? (
                              <img
                                src={blurUrl}
                                alt=""
                                className={`absolute inset-0 h-full w-full object-contain p-4 transition duration-500 ${
                                  isLoaded ? 'scale-105 opacity-0 blur-xl' : 'opacity-100 blur-lg'
                                }`}
                                aria-hidden="true"
                              />
                            ) : null}
                            {isLoaded ? (
                              <img
                                src={displayUrl}
                                alt={image.driveFileName || image.fileName || 'Uploaded image'}
                                className="relative h-full w-full bg-white object-contain p-4 transition duration-700 group-hover:scale-[1.04]"
                                loading="eager"
                                decoding="async"
                                fetchPriority={slideIndex === activeSlide ? 'high' : 'low'}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center">
                                <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-sky/20 border-t-brand-sky" />
                              </div>
                            )}
                          </div>
                        </article>
                      )
                    })}
                    {slide.length === 1 ? <div className="hidden md:block" /> : null}
                  </div>
                ))}
              </div>
            </section>

            <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-5 rounded-full bg-white/75 px-4 py-3 shadow-[0_22px_55px_rgba(13,43,69,0.16)] backdrop-blur">
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-ink text-sm font-bold text-white transition hover:scale-105"
                type="button"
                onClick={() =>
                  setActiveSlide((current) => (current === 0 ? slides.length - 1 : current - 1))
                }
              >
                &#8249;
              </button>
              <div className="flex items-center gap-2">
                {slides.map((_, index) => (
                  <button
                    key={`dot-${index}`}
                    className={`h-2.5 rounded-full transition-all ${
                      index === activeSlide ? 'w-8 bg-brand-sky' : 'w-2.5 bg-brand-ink/20'
                    }`}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    onClick={() => setActiveSlide(index)}
                  />
                ))}
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-sky text-sm font-bold text-white transition hover:scale-105"
                type="button"
                onClick={() => setActiveSlide((current) => (current + 1) % slides.length)}
              >
                &#8250;
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function SpotlightPanel() {
  return (
    <section className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.78),transparent_32%),radial-gradient(circle_at_top,rgba(44,169,225,0.16),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,111,52,0.18),transparent_22%)]" />
      <div className="absolute inset-0 animate-[spotlightPulse_3.8s_ease-in-out_infinite] bg-[radial-gradient(circle_at_center,rgba(255,214,102,0.22),transparent_36%)]" />
      <div className="relative flex w-full max-w-3xl items-center justify-center">
        <div className="animate-[logoReveal_1.1s_cubic-bezier(0.22,1,0.36,1)_both] rounded-[34px] border border-white/70 bg-white/88 p-4 shadow-[0_38px_100px_rgba(13,43,69,0.28)] backdrop-blur md:p-6">
          <img
            src={dswdImage}
            alt="DSWD"
            className="h-auto max-h-[72vh] w-full rounded-[24px] object-contain"
          />
        </div>
      </div>
    </section>
  )
}

function pumpPreloadQueue(queueRef, activeLoadsRef, concurrency, setLoadedUrls) {
  while (activeLoadsRef.current < concurrency && queueRef.current.length > 0) {
    const nextUrl = queueRef.current.shift()

    if (!nextUrl) {
      return
    }

    activeLoadsRef.current += 1

    const image = new window.Image()
    image.decoding = 'async'
    image.onload = () => {
      activeLoadsRef.current -= 1
      setLoadedUrls((current) => ({ ...current, [nextUrl]: true }))
      pumpPreloadQueue(queueRef, activeLoadsRef, concurrency, setLoadedUrls)
    }
    image.onerror = () => {
      activeLoadsRef.current -= 1
      setLoadedUrls((current) => ({ ...current, [nextUrl]: false }))
      pumpPreloadQueue(queueRef, activeLoadsRef, concurrency, setLoadedUrls)
    }
    image.src = nextUrl
  }
}

function chunkImages(items, size) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function getDisplayImageUrl(image) {
  if (image.drivePreviewUrl) {
    return image.drivePreviewUrl
  }

  if (image.driveFileId) {
    return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w720`
  }

  return image.driveWebViewLink || ''
}

function getParadeImageUrl(image) {
  if (image.driveParadeUrl) {
    return image.driveParadeUrl
  }

  if (image.driveFileId) {
    return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w384`
  }

  return getDisplayImageUrl(image)
}

function getBlurImageUrl(image) {
  if (image.previewDataUrl) {
    return image.previewDataUrl
  }

  if (image.driveFileId) {
    return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w128`
  }

  return ''
}

export default ImagesPage
