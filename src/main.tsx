import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyChromeTheme, getSavedChromeThemeMode } from './utils/themeManager'

// Apply saved chrome theme immediately on boot
applyChromeTheme(getSavedChromeThemeMode());

// Clear stale tickerpen, drawing, or cached chart state keys to prevent interference with live charts
try {
  Object.keys(localStorage).forEach(key => {
    if (key.toLowerCase().includes('tickerpen') || key.toLowerCase().includes('chart') || key.toLowerCase().includes('drawing')) {
      if (key !== 'chart_starred_periods' && !key.includes('shortcut') && !key.includes('theme')) {
        localStorage.removeItem(key);
      }
    }
  });
  Object.keys(sessionStorage).forEach(key => {
    if (key.toLowerCase().includes('tickerpen') || key.toLowerCase().includes('chart') || key.toLowerCase().includes('drawing')) {
      sessionStorage.removeItem(key);
    }
  });
} catch (e) {
  console.warn('Failed to clear storage:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
