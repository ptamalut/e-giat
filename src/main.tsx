import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { BrandProvider } from './components/brand'
import { ThemeProvider } from './components/theme'
import { UIProvider } from './components/ui'
import '@fontsource-variable/inter'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <UIProvider>
          <AuthProvider>
            <BrandProvider>
              <App />
            </BrandProvider>
          </AuthProvider>
        </UIProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
