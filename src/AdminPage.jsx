import { useEffect, useMemo, useState } from 'react'
import {
  deleteFrameTemplate,
  deleteImageRecord,
  isStorageReady,
  saveAppSettings,
  subscribeToAppSettings,
  subscribeToImageRecords,
  uploadFrameTemplate,
} from './lib/firebase'
import {
  DEFAULT_FRAME_ID,
  FRAME_OPTIONS,
  buildFrameOptions,
  normalizeCustomFrames,
} from './lib/frameOptions'
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
  const [settings, setSettings] = useState(null)
  const [isSettingsLoading, setIsSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [selectedFrameId, setSelectedFrameId] = useState(DEFAULT_FRAME_ID)
  const [allowFreeFrameChoice, setAllowFreeFrameChoice] = useState(false)
  const [customFrames, setCustomFrames] = useState([])
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaveMessage, setPasswordSaveMessage] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [newFrameLabel, setNewFrameLabel] = useState('')
  const [newFrameFileName, setNewFrameFileName] = useState('')
  const [pendingCustomFrame, setPendingCustomFrame] = useState(null)

  const frameOptions = useMemo(() => buildFrameOptions(customFrames), [customFrames])

  useEffect(() => {
    if (window.sessionStorage.getItem(adminSessionKey) === 'true') {
      setIsUnlocked(true)
    }
  }, [])

  useEffect(() => {
    setIsSettingsLoading(true)
    setSettingsError('')

    return subscribeToAppSettings(
      (nextSettings) => {
        setSettings(nextSettings)
        setSelectedFrameId(nextSettings?.selectedFrameId || DEFAULT_FRAME_ID)
        setAllowFreeFrameChoice(Boolean(nextSettings?.allowFreeFrameChoice))
        setCustomFrames(normalizeCustomFrames(nextSettings?.customFrames))
        setIsSettingsLoading(false)
      },
      (error) => {
        setSettingsError(error instanceof Error ? error.message : 'Could not load settings.')
        setIsSettingsLoading(false)
      },
    )
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

    const effectivePassword = settings?.adminPassword || adminPassword

    if (!effectivePassword) {
      setPasswordError('No admin password is set yet.')
      return
    }

    if (password !== effectivePassword) {
      setPasswordError('Wrong password.')
      return
    }

    window.sessionStorage.setItem(adminSessionKey, 'true')
    setPasswordError('')
    setPassword('')
    setIsUnlocked(true)
  }

  async function handleSaveSettings(event) {
    event.preventDefault()

    setIsSavingSettings(true)
    setSettingsError('')
    setSettingsMessage('')

    try {
      let nextCustomFrames = customFrames

      if (pendingCustomFrame?.file) {
        const uploadedFrame = await uploadFrameTemplate(
          pendingCustomFrame.file,
          pendingCustomFrame.label,
        )
        nextCustomFrames = [...customFrames, uploadedFrame]
      }

      await saveAppSettings({
        selectedFrameId,
        allowFreeFrameChoice,
        customFrames: nextCustomFrames,
      })
      setCustomFrames(nextCustomFrames)
      setPendingCustomFrame(null)
      setNewFrameFileName('')
      setNewFrameLabel('')
      setSettingsMessage('Settings saved.')
      setIsSettingsModalOpen(false)
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Could not save settings.')
    } finally {
      setIsSavingSettings(false)
    }
  }

  async function handleAddCustomFrame(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!isStorageReady()) {
      setSettingsError('Firebase Storage is not configured.')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setSettingsError('Template image is too large. Please keep it under 5MB.')
      event.target.value = ''
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const nextFrame = {
        id: `pending-custom-frame-${Date.now()}`,
        label: newFrameLabel.trim() || buildFrameLabelFromFileName(file.name),
        src: dataUrl,
        file,
      }
      setPendingCustomFrame(nextFrame)
      setSettingsError('')
      setSettingsMessage('Template preview ready. Click Save Settings to add it.')
      setNewFrameFileName(file.name)
      event.target.value = ''
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Could not add that template image.')
      event.target.value = ''
    }
  }

  async function handleRemoveCustomFrame(frameId) {
    const nextFrames = customFrames.filter((frame) => frame.id !== frameId)
    const nextSelectedFrameId = selectedFrameId === frameId ? DEFAULT_FRAME_ID : selectedFrameId

    setIsSavingSettings(true)
    try {
      const frameToDelete = customFrames.find((frame) => frame.id === frameId)

      if (frameToDelete?.storagePath) {
        await deleteFrameTemplate(frameToDelete.storagePath)
      }

      await saveAppSettings({
        selectedFrameId: nextSelectedFrameId,
        allowFreeFrameChoice,
        customFrames: nextFrames,
      })
      setCustomFrames(nextFrames)
      setSelectedFrameId(nextSelectedFrameId)
      setSettingsError('')
      setSettingsMessage('Template removed.')
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Could not remove that template.')
    } finally {
      setIsSavingSettings(false)
    }
  }

  async function handleSavePassword(event) {
    event.preventDefault()

    if (!newPassword.trim()) {
      setPasswordSaveMessage('')
      setSettingsError('New password is required.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordSaveMessage('')
      setSettingsError('Passwords do not match.')
      return
    }

    setIsSavingPassword(true)
    setSettingsError('')
    setPasswordSaveMessage('')

    try {
      await saveAppSettings({
        adminPassword: newPassword.trim(),
      })
      setPasswordSaveMessage('Password updated.')
      setNewPassword('')
      setConfirmPassword('')
      setIsPasswordModalOpen(false)
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Could not save password.')
    } finally {
      setIsSavingPassword(false)
    }
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
            {isSettingsLoading ? (
              <div className="mt-6 flex justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-sky/20 border-t-brand-sky" />
              </div>
            ) : (
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
            )}
            {passwordError ? <p className="mt-4 text-sm text-red-700">{passwordError}</p> : null}
            {settingsError ? <p className="mt-4 text-sm text-red-700">{settingsError}</p> : null}
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
            <button
              className="inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5"
              type="button"
              onClick={() => {
                setSettingsError('')
                setSettingsMessage('')
                setIsSettingsModalOpen(true)
              }}
            >
              Open Settings
            </button>
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
        {settingsError && isUnlocked ? <p className="mt-4 text-sm text-red-700">{settingsError}</p> : null}

        <div className="mt-6 rounded-[24px] border border-brand-ink/10 bg-white/80 px-5 py-4 shadow-panel backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral">
                Settings
              </p>
              <p className="mt-2 text-sm text-brand-muted">
                Default frame: {frameOptions.find((frame) => frame.id === selectedFrameId)?.label || 'Selected Frame'} | Free choice:{' '}
                {allowFreeFrameChoice ? 'On' : 'Off'}
              </p>
            </div>
            {settingsMessage ? <p className="text-sm text-green-700">{settingsMessage}</p> : null}
          </div>
        </div>

        {isSettingsModalOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-brand-ink/35 px-4 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-[28px] border border-white/50 bg-white/95 p-6 shadow-[0_35px_100px_rgba(13,43,69,0.25)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral">
                    Settings
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-brand-ink">
                    Admin access and active frame
                  </h2>
                  <p className="mt-2 text-sm text-brand-muted">
                    Set the default frame, allow free frame choice, and manage the admin password.
                  </p>
                </div>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5"
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                >
                  Close
                </button>
              </div>

              <form className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" onSubmit={handleSaveSettings}>
                <div className="grid gap-4">
                  <div className="rounded-[24px] border border-brand-ink/10 bg-white p-4">
                    <p className="text-sm font-semibold text-brand-ink">Admin Password</p>
                    <p className="mt-2 text-sm text-brand-muted">
                      Password is stored in Firebase settings.
                    </p>
                    <button
                      className="mt-4 inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5"
                      type="button"
                      onClick={() => {
                        setSettingsError('')
                        setPasswordSaveMessage('')
                        setNewPassword('')
                        setConfirmPassword('')
                        setIsPasswordModalOpen(true)
                      }}
                    >
                      Change Pass
                    </button>
                  </div>

                  <label className="flex items-start gap-3 rounded-[24px] border border-brand-ink/10 bg-white p-4">
                    <input
                      className="mt-1 h-4 w-4 accent-brand-sky"
                      type="checkbox"
                      checked={allowFreeFrameChoice}
                      onChange={(event) => setAllowFreeFrameChoice(event.target.checked)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-brand-ink">Free Choice</span>
                      <span className="mt-1 block text-sm text-brand-muted">
                        Let users choose any available frame for themselves on the picture page.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="grid gap-3">
                  <span className="text-sm font-semibold text-brand-ink">Default Frame To Use</span>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {frameOptions.map((frame) => {
                      const isSelected = selectedFrameId === frame.id

                      return (
                        <label
                          key={frame.id}
                          className={`cursor-pointer rounded-[24px] border p-3 transition ${
                            isSelected
                              ? 'border-brand-sky bg-brand-sky/8 shadow-soft'
                              : 'border-brand-ink/10 bg-white'
                          }`}
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name="selectedFrameId"
                            value={frame.id}
                            checked={isSelected}
                            onChange={(event) => setSelectedFrameId(event.target.value)}
                          />
                          <img
                            src={frame.src}
                            alt={frame.label}
                            className="aspect-square w-full rounded-[18px] object-cover"
                          />
                          <p className="mt-3 text-sm font-semibold text-brand-ink">{frame.label}</p>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="lg:col-span-2 rounded-[24px] border border-brand-ink/10 bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-brand-ink">Add Template Frame</p>
                      <p className="mt-1 text-sm text-brand-muted">
                        Upload a small PNG or JPG frame image. If the name is blank, we will use the file name.
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.14em] text-brand-muted">
                      Max 5MB
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.7fr)_minmax(0,0.3fr)]">
                    <input
                      className="rounded-2xl border border-brand-ink/12 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-sky"
                      type="text"
                      value={newFrameLabel}
                      onChange={(event) => setNewFrameLabel(event.target.value)}
                      placeholder="Template name (optional)"
                    />
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5">
                      Choose Image
                      <input
                        className="hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleAddCustomFrame}
                      />
                    </label>
                  </div>

                  {newFrameFileName ? (
                    <p className="mt-3 text-sm text-brand-muted">Last added file: {newFrameFileName}</p>
                  ) : null}

                  {pendingCustomFrame ? (
                    <div className="mt-4 rounded-[22px] border border-dashed border-brand-sky/40 bg-brand-sky/5 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-sky">
                        Pending Template Preview
                      </p>
                      <div className="mt-3 flex items-start gap-3">
                        <img
                          src={pendingCustomFrame.src}
                          alt={pendingCustomFrame.label}
                          className="h-24 w-24 rounded-[14px] object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-brand-ink">
                            {pendingCustomFrame.label}
                          </p>
                          <p className="mt-1 text-sm text-brand-muted">
                            This will be added when you click Save Settings.
                          </p>
                          <button
                            className="mt-3 inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-4 py-2 text-xs font-semibold text-brand-ink transition hover:-translate-y-0.5"
                            type="button"
                            onClick={() => {
                              setPendingCustomFrame(null)
                              setNewFrameFileName('')
                              setSettingsMessage('')
                            }}
                          >
                            Cancel Preview
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {customFrames.length > 0 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {customFrames.map((frame) => (
                        <article
                          key={frame.id}
                          className="rounded-[22px] border border-brand-ink/10 bg-white p-3"
                        >
                          <img
                            src={frame.src}
                            alt={frame.label}
                            className="aspect-square w-full rounded-[16px] object-cover"
                          />
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-brand-ink">
                              {frame.label}
                            </p>
                            <button
                              className="inline-flex items-center justify-center rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5"
                              type="button"
                              onClick={() => handleRemoveCustomFrame(frame.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-brand-muted">No custom templates added yet.</p>
                  )}
                </div>

                <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-brand-sky px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isSavingSettings || isSettingsLoading}
                  >
                    {isSavingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                  {passwordSaveMessage ? (
                    <p className="text-sm text-green-700">{passwordSaveMessage}</p>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isPasswordModalOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-brand-ink/35 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[28px] border border-white/50 bg-white/95 p-6 shadow-[0_35px_100px_rgba(13,43,69,0.25)]">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-brand-coral">
                Change Password
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-brand-ink">
                Update admin password
              </h3>
              <form className="mt-5 grid gap-4" onSubmit={handleSavePassword}>
                <input
                  className="rounded-2xl border border-brand-ink/12 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-sky"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                />
                <input
                  className="rounded-2xl border border-brand-ink/12 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-sky"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-brand-sky px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isSavingPassword}
                  >
                    {isSavingPassword ? 'Saving...' : 'Save Password'}
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-brand-ink/10 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-0.5"
                    type="button"
                    onClick={() => {
                      setIsPasswordModalOpen(false)
                      setNewPassword('')
                      setConfirmPassword('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Could not read file.'))
    }

    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function buildFrameLabelFromFileName(fileName) {
  const baseName = fileName.replace(/\.[^/.]+$/, '').trim()

  if (!baseName) {
    return 'Custom Frame'
  }

  return baseName.replace(/[-_]+/g, ' ')
}

export default AdminPage
