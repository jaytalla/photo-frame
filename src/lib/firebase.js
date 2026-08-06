import { initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean)

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
const firestore = app ? getFirestore(app) : null
const storage = app ? getStorage(app) : null
const settingsDocRef = firestore ? doc(firestore, 'settings', 'config') : null

function toFriendlyFirestoreError(error, action = 'complete this action') {
  if (error?.code === 'permission-denied') {
    return new Error(
      `Firestore denied permission while trying to ${action}. Update your Firestore rules to allow the images and settings collections.`,
    )
  }

  return error instanceof Error ? error : new Error(`Could not ${action}.`)
}

function toFriendlyStorageError(error, action = 'complete this action') {
  if (error?.code === 'storage/unauthorized') {
    return new Error(
      `Firebase Storage denied permission while trying to ${action}. Update your Storage rules to allow frame template uploads.`,
    )
  }

  return error instanceof Error ? error : new Error(`Could not ${action}.`)
}

export function isFirestoreReady() {
  return Boolean(firestore)
}

export function isStorageReady() {
  return Boolean(storage)
}

export async function saveImageRecord(record) {
  if (!firestore) {
    return { saved: false, reason: 'missing-config' }
  }

  const docRef = await addDoc(collection(firestore, 'images'), {
    heartCount: 0,
    ...record,
    createdAt: serverTimestamp(),
  })

  return { saved: true, id: docRef.id }
}

export async function listImageRecords() {
  if (!firestore) {
    return []
  }

  const snapshot = await getDocs(
    query(collection(firestore, 'images'), orderBy('createdAt', 'asc')),
  )

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

export function subscribeToImageRecords(onNext, onError) {
  if (!firestore) {
    onNext([])
    return () => {}
  }

  return onSnapshot(
    query(collection(firestore, 'images'), orderBy('createdAt', 'asc')),
    (snapshot) => {
      onNext(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })),
      )
    },
    (error) => {
      if (typeof onError === 'function') {
        onError(toFriendlyFirestoreError(error, 'load images'))
      }
    },
  )
}

export async function deleteImageRecord(imageId) {
  if (!firestore) {
    return { deleted: false, reason: 'missing-config' }
  }

  try {
    await deleteDoc(doc(firestore, 'images', imageId))
  } catch (error) {
    throw toFriendlyFirestoreError(error, 'delete the image')
  }

  return { deleted: true }
}

export async function incrementImageHeart(imageId) {
  if (!firestore) {
    return { updated: false, reason: 'missing-config' }
  }

  try {
    await updateDoc(doc(firestore, 'images', imageId), {
      heartCount: increment(1),
      lastHeartedAt: serverTimestamp(),
    })
  } catch (error) {
    throw toFriendlyFirestoreError(error, 'update the heart count')
  }

  return { updated: true }
}

export async function getAppSettings() {
  if (!settingsDocRef) {
    return null
  }

  const snapshot = await getDoc(settingsDocRef)

  if (!snapshot.exists()) {
    return null
  }

  return snapshot.data()
}

export function subscribeToAppSettings(onNext, onError) {
  if (!settingsDocRef) {
    onNext(null)
    return () => {}
  }

  return onSnapshot(
    settingsDocRef,
    (snapshot) => {
      onNext(snapshot.exists() ? snapshot.data() : null)
    },
    (error) => {
      if (typeof onError === 'function') {
        onError(toFriendlyFirestoreError(error, 'load settings'))
      }
    },
  )
}

export async function saveAppSettings(settings) {
  if (!settingsDocRef) {
    return { saved: false, reason: 'missing-config' }
  }

  try {
    await setDoc(
      settingsDocRef,
      {
        ...settings,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (error) {
    throw toFriendlyFirestoreError(error, 'save settings')
  }

  return { saved: true }
}

export async function uploadFrameTemplate(file, label) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured.')
  }

  const frameId = `custom-frame-${Date.now()}`
  const storagePath = `frame-templates/${frameId}-${sanitizeFileName(file.name)}`

  try {
    const storageRef = ref(storage, storagePath)
    await uploadBytes(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
    })
    const src = await getDownloadURL(storageRef)

    return {
      id: frameId,
      label,
      src,
      storagePath,
    }
  } catch (error) {
    throw toFriendlyStorageError(error, 'upload the frame template')
  }
}

export async function deleteFrameTemplate(storagePath) {
  if (!storage || !storagePath) {
    return
  }

  try {
    await deleteObject(ref(storage, storagePath))
  } catch (error) {
    if (error?.code === 'storage/object-not-found') {
      return
    }

    throw toFriendlyStorageError(error, 'delete the frame template')
  }
}

function sanitizeFileName(fileName) {
  return String(fileName || 'frame')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
