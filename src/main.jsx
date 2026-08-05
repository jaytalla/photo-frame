import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ImagesPage from './ImagesPage.jsx'
import AdminPage from './AdminPage.jsx'

function RootRouter() {
  const pathname = window.location.pathname

  if (pathname.endsWith('/admin') || pathname.endsWith('/admin/')) {
    return <AdminPage />
  }

  if (pathname.endsWith('/images') || pathname.endsWith('/images/')) {
    return <ImagesPage />
  }

  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
)
