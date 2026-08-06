import defaultFrame from '../../assets/test-frame.png'
import frameOptionOne from '../../assets/test-frame1.png'
import frameOptionTwo from '../../assets/test-frame2.png'

export const DEFAULT_FRAME_ID = 'test-frame'

export const FRAME_OPTIONS = [
  {
    id: DEFAULT_FRAME_ID,
    label: 'Selected Frame',
    src: defaultFrame,
  },
  {
    id: 'test-frame-1',
    label: 'Frame Option 1',
    src: frameOptionOne,
  },
  {
    id: 'test-frame-2',
    label: 'Frame Option 2',
    src: frameOptionTwo,
  },
]

export function normalizeCustomFrames(customFrames) {
  if (!Array.isArray(customFrames)) {
    return []
  }

  return customFrames.filter(
    (frame) => frame && typeof frame.id === 'string' && typeof frame.label === 'string' && typeof frame.src === 'string',
  )
}

export function buildFrameOptions(customFrames = []) {
  return [...FRAME_OPTIONS, ...normalizeCustomFrames(customFrames)]
}

export function getFrameById(frameId, customFrames = []) {
  const frameOptions = buildFrameOptions(customFrames)
  return frameOptions.find((frame) => frame.id === frameId) || frameOptions[0]
}
