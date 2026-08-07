import { useEffect, useMemo, useState } from 'react'
import pageBackground from '../assets/bg.png'
import { subscribeToImageRecords } from './lib/firebase'
import { getDisplayImageUrl, getHeartCount } from './lib/imageRecords'

const defaultVisibleCount = 5
const leaderboardPageSize = 10

function LeaderboardPage() {
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    setIsLoading(true)
    setErrorMessage('')

    return subscribeToImageRecords(
      (records) => {
        setImages(records)
        setIsLoading(false)
      },
      (error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load leaderboard.')
        setIsLoading(false)
      },
    )
  }, [])

  const rankedImages = useMemo(() => {
    return [...images]
      .sort((left, right) => {
        const heartDelta = getHeartCount(right) - getHeartCount(left)

        if (heartDelta !== 0) {
          return heartDelta
        }

        return String(left.driveFileName || left.fileName || left.id).localeCompare(
          String(right.driveFileName || right.fileName || right.id),
        )
      })
      .map((image, index) => ({
        ...image,
        heartCount: getHeartCount(image),
        rank: index + 1,
      }))
  }, [images])

  const totalPages = Math.max(1, Math.ceil(rankedImages.length / leaderboardPageSize))

  useEffect(() => {
    if (!showAll) {
      setCurrentPage(1)
      return
    }

    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, showAll, totalPages])

  const visibleImages = useMemo(() => {
    if (!showAll) {
      return rankedImages.slice(0, defaultVisibleCount)
    }

    const startIndex = (currentPage - 1) * leaderboardPageSize
    return rankedImages.slice(startIndex, startIndex + leaderboardPageSize)
  }, [currentPage, rankedImages, showAll])

  const leaders = rankedImages.slice(0, 3)
  const totalWithHearts = rankedImages.filter((image) => image.heartCount > 0).length

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-5 text-[#162033] sm:px-6 lg:px-8"
      style={{ backgroundImage: `url(${pageBackground})` }}
    >
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-[24px] border border-white/70 bg-white/82 px-5 py-5 shadow-[0_16px_40px_rgba(27,39,65,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-slate-400">
              Leaderboard
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">
              Most Loved Photos
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Live heart rankings from the voting board.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
              href="/photo-frame/voting"
            >
              <span>{'\u2039'}</span>
              Voting
            </a>
            <a
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
              href="/photo-frame/images"
            >
              Gallery
            </a>
          </div>
        </header>

        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {isLoading ? (
          <section className="grid flex-1 place-items-center rounded-[28px] border border-white/70 bg-white/76 shadow-[0_20px_48px_rgba(27,39,65,0.08)]">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
              <p className="text-sm text-slate-500">Loading leaderboard...</p>
            </div>
          </section>
        ) : rankedImages.length === 0 ? (
          <section className="grid flex-1 place-items-center rounded-[28px] border border-white/70 bg-white/76 p-8 text-center shadow-[0_20px_48px_rgba(27,39,65,0.08)]">
            <p className="text-sm text-slate-500">No images available yet.</p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              {leaders.map((image) => (
                <article
                  key={image.id}
                  className={`rounded-[28px] border bg-white/80 p-4 shadow-[0_18px_42px_rgba(27,39,65,0.08)] backdrop-blur ${
                    image.rank === 1
                      ? 'border-[#f6c453] md:-translate-y-2'
                      : image.rank === 2
                        ? 'border-slate-200'
                        : 'border-[#f2b6c6]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                      #{image.rank}
                    </span>
                    <span className="rounded-full bg-[#ffe2ea] px-3 py-1 text-sm font-semibold text-[#d73d6c]">
                      {'\u2665'} {image.heartCount}
                    </span>
                  </div>
                  <div className="mt-4 aspect-square overflow-hidden rounded-[20px] bg-[#f7f7fa]">
                    <img
                      src={getDisplayImageUrl(image)}
                      alt={image.driveFileName || image.fileName || 'Ranked image'}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <p className="mt-4 truncate text-sm font-semibold text-slate-900">
                    {image.driveFileName || image.fileName || 'Untitled image'}
                  </p>
                </article>
              ))}
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/78 p-4 shadow-[0_20px_48px_rgba(27,39,65,0.08)] backdrop-blur sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Rankings
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Showing {visibleImages.length} of {rankedImages.length} images.
                    {totalWithHearts ? ` ${totalWithHearts} image(s) have hearts.` : ''}
                  </p>
                </div>
                {rankedImages.length > defaultVisibleCount ? (
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
                    type="button"
                    onClick={() => {
                      setShowAll((current) => !current)
                      setCurrentPage(1)
                    }}
                  >
                    {showAll ? 'Show Top 5' : 'Show All'}
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3">
                {visibleImages.map((image) => (
                  <article
                    key={image.id}
                    className="grid gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(27,39,65,0.06)] sm:grid-cols-[84px_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="flex items-center gap-3 sm:gap-0">
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
                        #{image.rank}
                      </span>
                      <div className="aspect-square h-[84px] overflow-hidden rounded-[18px] bg-[#f7f7fa] sm:ml-4">
                        <img
                          src={getDisplayImageUrl(image)}
                          alt={image.driveFileName || image.fileName || 'Ranked image'}
                          className="h-full w-full object-contain"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {image.driveFileName || image.fileName || 'Untitled image'}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {image.uploadedByName || image.uploadedByEmail || 'Unknown uploader'}
                      </p>
                    </div>
                    <div className="inline-flex items-center justify-center rounded-full bg-[#ffe2ea] px-4 py-2 text-sm font-semibold text-[#d73d6c] sm:justify-self-end">
                      {'\u2665'} {image.heartCount}
                    </div>
                  </article>
                ))}
              </div>

              {showAll && rankedImages.length > leaderboardPageSize ? (
                <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-5 sm:flex-row">
                  <p className="text-sm text-slate-500">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
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

export default LeaderboardPage
