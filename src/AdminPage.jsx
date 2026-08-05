import { useEffect, useMemo, useState } from 'react'
import { deleteImageRecord, subscribeToImageRecords } from './lib/firebase'
import { getDisplayImageUrl, getHeartCount, getParadeImageUrl } from './lib/imageRecords'

const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || ''
const adminSessionKey = 'photo-frame-admin-session'
const pageSize = 12

function AdminPage() {
  const [password, setPassword] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (window.sessionStorage.getItem(adminSessionKey) === 'true') {
      setIsUnlocked(true)
    }
  }, [])

  useEffect(() => {
    if (!isUnlocked) {
      return
    }

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
  }, [isUnlocked])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const imageCountLabel = useMemo(() => {
    if (images.length === 1) {
      return '1 image'
    }

    return `${images.length} images`
  }, [images.length])

  const filteredImages = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    if (!normalizedSearch) {
      return images
    }

    return images.filter((image) => {
      const haystacks = [
        image.driveFileName,
        image.fileName,
        image.uploadedByName,
        image.uploadedByEmail,
      ]

      return haystacks.some((value) => value?.toLowerCase().includes(normalizedSearch))
    })
  }, [images, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredImages.length / pageSize))
  const paginatedImages = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredImages.slice(startIndex, startIndex + pageSize)
  }, [currentPage, filteredImages])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  function unlockAdmin(event) {
    event.preventDefault()

    if (!adminPassword) {
      setPasswordError('Missing VITE_ADMIN_PASSWORD in .env.')
      return
    }

    if (password !== adminPassword) {
      setPasswordError('Wrong password.')
      return
    }

    window.sessionStorage.setItem(adminSessionKey, 'true')
    setPasswordError('')
    setPassword('')
    setIsUnlocked(true)
  }

  async function handleDelete(image) {
    const shouldDelete = window.confirm(
      `Remove ${image.driveFileName || image.fileName || 'this image'} from the live gallery?`,
    )

    if (!shouldDelete) {
      return
    }

    setDeletingId(image.id)
    setErrorMessage('')

    try {
      await deleteImageRecord(image.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove the image.')
    } finally {
      setDeletingId('')
    }
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(44,169,225,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,111,52,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] px-4 py-8">
        <section className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
          <div className="w-full max-w-md rounded-[28px] border border-brand-ink/12 bg-white/90 p-6 shadow-panel backdrop-blur md:p-8">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral">
              Admin Access
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-brand-ink">
              Enter password to open admin
            </h1>
            <form className="mt-6 grid gap-4" onSubmit={unlockAdmin}>
              <input
                className="rounded-2xl border border-brand-ink/12 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-sky"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <button
                className="inline-flex items-center justify-center rounded-full bg-brand-sky px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
                type="submit"
              >
                Open Admin
              </button>
            </form>
            {passwordError ? <p className="mt-4 text-sm text-red-700">{passwordError}</p> : null}
            <a
              className="mt-5 inline-flex text-sm font-semibold text-brand-sky"
              href="/photo-frame/"
            >
              Back to picture page
            </a>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(44,169,225,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,111,52,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] px-4 py-6 md:px-6 md:py-8">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 rounded-[28px] border border-brand-ink/10 bg-white/80 px-5 py-5 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral">
              Admin Page
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-brand-ink">
              Manage uploaded images
            </h1>
            <p className="mt-2 text-sm text-brand-muted">{imageCountLabel}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex items-center justify-center rounded-full bg-brand-sky px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              href="/photo-frame/images"
            >
              Open Images View
            </a>
            <a
              className="inline-flex items-center justify-center rounded-full bg-brand-coral px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              href="/photo-frame/voting"
            >
              Open Voting
            </a>
            <button
              className="inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5"
              type="button"
              onClick={() => {
                window.sessionStorage.removeItem(adminSessionKey)
                setIsUnlocked(false)
              }}
            >
              Lock Admin
            </button>
          </div>
        </div>

        {errorMessage ? <p className="mt-4 text-sm text-red-700">{errorMessage}</p> : null}

        <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-brand-ink/10 bg-white/80 px-5 py-4 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
          <input
            className="w-full rounded-2xl border border-brand-ink/12 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-sky md:max-w-md"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by filename or uploader"
          />
          <p className="text-sm text-brand-muted">
            Showing {paginatedImages.length} of {filteredImages.length}
          </p>
        </div>

        {isLoading ? (
          <section className="grid min-h-[50vh] place-items-center">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-brand-sky/20 border-t-brand-sky" />
          </section>
        ) : (
          <>
            <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedImages.map((image) => {
              const displayUrl = getAdminImageUrl(image)
              const isDeleting = deletingId === image.id

              return (
                <article
                  key={image.id}
                  className="overflow-hidden rounded-[28px] border border-brand-ink/10 bg-white shadow-[0_20px_60px_rgba(13,43,69,0.12)]"
                >
                  <div className="aspect-square bg-[linear-gradient(180deg,#eef5ff_0%,#ddeaff_100%)] p-4">
                    <img
                      src={displayUrl}
                      alt={image.driveFileName || image.fileName || 'Uploaded image'}
                      className="h-full w-full rounded-[20px] bg-white object-contain"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="grid gap-2 px-5 py-4">
                    <p className="truncate text-sm font-semibold text-brand-ink">
                      {image.driveFileName || image.fileName || 'Untitled image'}
                    </p>
                    <p className="text-xs text-brand-muted">
                      {image.uploadedByName || image.uploadedByEmail || 'Unknown uploader'}
                    </p>
                    {getHeartCount(image) ? (
                      <p className="text-xs font-semibold text-brand-coral">
                        Hearts: {getHeartCount(image)}
                      </p>
                    ) : null}
                    <button
                      className="mt-2 inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => handleDelete(image)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Removing...' : 'Remove Image'}
                    </button>
                  </div>
                </article>
              )
            })}
            </section>

            {filteredImages.length === 0 ? (
              <section className="grid min-h-[30vh] place-items-center">
                <p className="text-sm text-brand-muted">No images matched your search.</p>
              </section>
            ) : null}

            {filteredImages.length > pageSize ? (
              <div className="mt-8 flex flex-col items-center justify-center gap-3 md:flex-row">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <p className="text-sm text-brand-muted">
                  Page {currentPage} of {totalPages}
                </p>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  )
}

function getAdminImageUrl(image) {
  return getParadeImageUrl(image) || getDisplayImageUrl(image)
}

export default AdminPage
