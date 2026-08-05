export function getDisplayImageUrl(image) {
  if (image.drivePreviewUrl) {
    return image.drivePreviewUrl
  }

  if (image.driveFileId) {
    return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w720`
  }

  return image.driveWebViewLink || ''
}

export function getParadeImageUrl(image) {
  if (image.driveParadeUrl) {
    return image.driveParadeUrl
  }

  if (image.driveFileId) {
    return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w384`
  }

  return getDisplayImageUrl(image)
}

export function getBlurImageUrl(image) {
  if (image.previewDataUrl) {
    return image.previewDataUrl
  }

  if (image.driveFileId) {
    return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w128`
  }

  return ''
}

export function getHeartCount(image) {
  const value = Number(image?.heartCount ?? 0)

  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.floor(value)
}
