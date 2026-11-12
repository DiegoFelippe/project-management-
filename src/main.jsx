import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import AuthProvider from '@/auth/AuthProvider'
import { Toaster } from '@/components/ui/sonner'
import Rotas from '@/rotas'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Rotas />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
