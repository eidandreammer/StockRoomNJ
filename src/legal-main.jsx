import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LegalApp from './LegalApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LegalApp />
  </StrictMode>,
)
