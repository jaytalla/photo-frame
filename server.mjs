import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import express from 'express'
import { google } from 'googleapis'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 5173)
const isProduction = process.argv.includes('--prod')

app.use(express.json({ limit: '25mb' }))

app.post('/api/upload-drive', async (req, res) => {
  try {
    const { imageDataUrl, fileName } = req.body ?? {}

    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return res.status(400).json({ error: 'Missing image data.' })
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    if (!folderId) {
      return res.status(500).json({ error: 'Missing GOOGLE_DRIVE_FOLDER_ID.' })
    }

    const credentials = await loadGoogleCredentials()
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })
    const upload = await drive.files.create({
      requestBody: {
        name: fileName || buildFileName(),
        parents: [folderId],
      },
      media: {
        mimeType: 'image/png',
        body: Readable.from(dataUrlToBuffer(imageDataUrl)),
      },
      fields: 'id,name,webViewLink',
      supportsAllDrives: true,
    })

    return res.json({
      fileId: upload.data.id,
      fileName: upload.data.name,
      webViewLink: upload.data.webViewLink,
    })
  } catch (error) {
    console.error('Drive upload failed:', error)

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'The image could not be uploaded to Google Drive.',
    })
  }
})

if (isProduction) {
  const distPath = path.join(__dirname, 'dist')
  app.use(express.static(distPath))
  app.get(/.*/, (_, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  })

  app.use(vite.middlewares)

  app.get(/.*/, async (req, res, next) => {
    try {
      const template = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8')
      const html = await vite.transformIndexHtml(req.originalUrl, template)
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
    } catch (error) {
      vite.ssrFixStacktrace(error)
      next(error)
    }
  })
}

app.listen(PORT, () => {
  console.log(`Photo frame app running at http://localhost:${PORT}`)
})

async function loadGoogleCredentials() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (keyFile) {
    const resolvedPath = path.resolve(__dirname, keyFile)
    const fileContents = await fs.readFile(resolvedPath, 'utf8')
    return JSON.parse(fileContents)
  }

  if (serviceAccountEmail && privateKey) {
    return {
      client_email: serviceAccountEmail,
      private_key: privateKey,
    }
  }

  throw new Error(
    'Missing Google service account credentials. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
  )
}

function dataUrlToBuffer(dataUrl) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/)

  if (!match) {
    throw new Error('Invalid image format.')
  }

  return Buffer.from(match[2], 'base64')
}

function buildFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `framed-photo-${timestamp}.png`
}
