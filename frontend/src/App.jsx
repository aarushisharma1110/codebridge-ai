import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Layout } from './components/Layout'
import { Heading, Notice } from './components/ui'
import { AuthPage } from './pages/AuthPages'
import { ActivityPage, CategoriesPage, QuestionsPage, SearchPage, TagPage, TagsPage, UnansweredPage, UsersPage } from './pages/Lists'
import { QuestionPage } from './pages/QuestionPage'
import { AskPage } from './pages/AskPage'
import { AccountPage, FavoritesPage, UserPage } from './pages/UserPages'
import {
  AdminCategories, AdminFlagged, AdminGate, AdminGeneral, AdminHidden, AdminStats, AdminUsage, AdminUsers, UsagePage
} from './pages/AdminPages'
import { AssistantPage } from './pages/Assistant'
import messages from '../../lang/message/en/messages.json'

const m = messages.q2a
const safeDestination = (from) => typeof from === 'string' && /^\/(?!\/)/.test(from) ? from : '/'

function Gate({ guest = false }) {
  const { user, signedOut } = useAuth()
  const location = useLocation()
  if (guest) return user ? <Navigate to={safeDestination(location.state?.from)} replace /> : <Outlet />
  return user ? <Outlet /> : <Navigate to="/login" replace
    state={signedOut ? null : { from: location.pathname + location.search }} />
}

function NotFound() {
  return <><Heading>{m.headings.notFound}</Heading><Notice kind="warning">{m.misc.notFoundText}</Notice></>
}

// /questions/<category> lists a category; numeric segments are legacy question links.
function QuestionsOrLegacy() {
  const { category } = useParams()
  if (/^[1-9]\d{0,9}$/.test(category)) return <Navigate to={`/${category}`} replace />
  return <QuestionsPage />
}

function AppRoutes() {
  const { pending, error, retry } = useAuth()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    document.getElementById('page-heading')?.focus({ preventScroll: true })
  }, [pathname, pending])

  if (pending || error) return <main className="qa-session-shell" tabIndex={-1}>
    {pending ? <div className="qa-waiting" role="status">{messages.app.checkingSession}</div>
      : <Notice kind="error">{error} <button className="qa-retry" onClick={retry}>{messages.common.retry}</button></Notice>}
  </main>

  return <Routes>
    <Route element={<Layout />}>
      <Route element={<Gate guest />}>
        <Route path="/login" element={<AuthPage key="login" />} />
        <Route path="/register" element={<AuthPage key="register" registering />} />
      </Route>
      <Route element={<Gate />}>
        <Route index element={<ActivityPage />} />
        <Route path="/activity" element={<Navigate to="/" replace />} />
        <Route path="/questions" element={<QuestionsPage />} />
        <Route path="/questions/new" element={<Navigate to="/ask" replace />} />
        <Route path="/questions/:id/edit" element={<LegacyEdit />} />
        <Route path="/questions/:category" element={<QuestionsOrLegacy />} />
        <Route path="/unanswered" element={<UnansweredPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/tag/:tag" element={<TagPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:sort" element={<UsersPage />} />
        <Route path="/user/:handle" element={<UserPage />} />
        <Route path="/user/:handle/activity" element={<UserPage tab="activity" />} />
        <Route path="/user/:handle/questions" element={<UserPage tab="questions" />} />
        <Route path="/user/:handle/answers" element={<UserPage tab="answers" />} />
        <Route path="/ask" element={<AskPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/profile" element={<Navigate to="/account" replace />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/usage" element={<UsagePage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/admin" element={<AdminGate><AdminGeneral /></AdminGate>} />
        <Route path="/admin/users" element={<AdminGate><AdminUsers /></AdminGate>} />
        <Route path="/admin/categories" element={<AdminGate><AdminCategories /></AdminGate>} />
        <Route path="/admin/stats" element={<AdminGate><AdminStats /></AdminGate>} />
        <Route path="/admin/usage" element={<AdminGate><AdminUsage /></AdminGate>} />
        <Route path="/admin/flagged" element={<AdminGate level="moderator"><AdminFlagged /></AdminGate>} />
        <Route path="/admin/hidden" element={<AdminGate level="moderator"><AdminHidden /></AdminGate>} />
        <Route path="/:id/:slug?" element={<QuestionPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Route>
  </Routes>
}

function LegacyEdit() {
  const { id } = useParams()
  return <Navigate to={`/${id}`} replace />
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
