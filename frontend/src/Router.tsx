import { BrowserRouter, Route, Routes } from 'react-router-dom'
import LoginPage from './Pages/LoginPage'
// import PreferencesPage from './Pages/PreferencePage'
import { RequireAuth, RedirectIfAuth, RequireAdmin } from './routes/guards'
import ClientPage from './Pages/ClientPage'
import { AuthProvider } from './api/lib/AuthContext'
import { FeedPage } from './Pages/FeedPage'
import AdminPage from './Pages/AdminPage'
import { ToastProvider } from './components/Toast'

function App() {

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
        <Routes>
          <Route element={<RedirectIfAuth />}>
            <Route path='/' element={<LoginPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            {/* <Route path='/preferences' element={<PreferencesPage />} /> */}

            <Route element={<RequireAdmin />}>
              <Route path='/admin' element={<AdminPage />} />
            </Route>

            <Route path='/feed' element={<FeedPage />} />

            <Route path='/clients' element={<ClientPage />} />
          </Route>
        </Routes>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App