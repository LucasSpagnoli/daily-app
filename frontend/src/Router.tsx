import { BrowserRouter, Route, Routes } from 'react-router-dom'
import LoginPage from './Pages/LoginPage'
// import PreferencesPage from './Pages/PreferencePage'
import { RequireAuth, RedirectIfAuth, RequireAdmin, RequireNonAdmin } from './routes/guards'
import ClientPage from './Pages/ClientPage'
import { AuthProvider } from './api/lib/AuthContext'
import { FeedPage } from './Pages/FeedPage'
import AdminPage from './Pages/AdminPage'
import { ToastProvider } from './components/Toast'
import ConfirmPayment from './Pages/ConfirmPayment'

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

              <Route element={<RequireNonAdmin />}>
                <Route path='/feed' element={<FeedPage />} />
                <Route path='/clients' element={<ClientPage />} />
              </Route>



            </Route>

            <Route path='/pagamento-confirmado' element={<ConfirmPayment />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App