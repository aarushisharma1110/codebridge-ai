import { useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Brand, Layout, Profile } from './components/Layout'
import { EmptyState, Notice } from './components/ui'
import { AuthPage } from './pages/AuthPage'
import { QuestionsPage, QuestionRoute } from './pages/Questions'
import { AssistantPage } from './pages/Assistant'
import { AdminPage, UsagePage } from './pages/Analytics'

function Gate({ guest = false }) {
  const { user, signedOut } = useAuth()
  const location = useLocation()
  if (guest) {
    const from = location.state?.from
    const destination = typeof from === 'string' && /^\/(?!\/)/.test(from) ? from : '/questions'
    return user ? <Navigate to={destination} replace /> : <Outlet />
  }
  return user ? <Outlet /> : <Navigate to="/login" replace
    state={signedOut ? null : { from: location.pathname }} />
}

function AdminGate() {
  return useAuth().user.role === 'admin' ? <Outlet /> :
    <EmptyState title="Administrator access required"
      action={<Link className="button secondary" to="/questions">Back to questions</Link>}>
      This page is available to administrators.
    </EmptyState>
}

function AppRoutes() {
  const { pending, error, retry } = useAuth()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('main')?.focus({ preventScroll: true })
  }, [pathname, pending])

  if (pending || error) return <main className="session-shell" tabIndex={-1}>
    <Brand />
    {pending ? <p className="loading" role="status"><span className="spinner" /> Checking your session…</p>
      : <Notice kind="error">
        <div>{error}</div>
        <button className="button secondary small" onClick={retry}>Try again</button>
      </Notice>}
  </main>

  return <Routes>
    <Route path="/" element={<Navigate to="/questions" replace />} />
    <Route element={<Gate guest />}>
      <Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" registering />} />
    </Route>
    <Route element={<Gate />}>
      <Route element={<Layout />}>
        <Route path="/questions" element={<QuestionsPage />} />
        <Route path="/questions/new" element={<QuestionRoute key="new" mode="create" />} />
        <Route path="/questions/:id" element={<QuestionRoute key="view" mode="view" />} />
        <Route path="/questions/:id/edit" element={<QuestionRoute key="edit" mode="edit" />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/usage" element={<UsagePage />} />
        <Route path="/profile" element={<Profile />} />
        <Route element={<AdminGate />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<EmptyState title="Page not found"
          action={<Link className="button secondary" to="/questions">Back to questions</Link>} />} />
      </Route>
    </Route>
  </Routes>
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
