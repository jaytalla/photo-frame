import { initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'

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

export function isFirestoreReady() {
  return Boolean(firestore)
}

export async function saveImageRecord(record) {
  if (!firestore) {
    return { saved: false, reason: 'missing-config' }
  }

  const docRef = await addDoc(collection(firestore, 'images'), {
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
    onError,
  )
}

export async function deleteImageRecord(imageId) {
  if (!firestore) {
    return { deleted: false, reason: 'missing-config' }
  }

  await deleteDoc(doc(firestore, 'images', imageId))

  return { deleted: true }
}
