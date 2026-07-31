import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { initInstallCapture } from './lib/install'

// Must run before the browser fires `beforeinstallprompt`, which happens well
// before any screen that offers an install button is mounted.
initInstallCapture()

// Apply the saved theme before first paint so there is no flash of the wrong one.
const savedTheme = localStorage.getItem('forge.theme')
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.dataset.theme = savedTheme
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
