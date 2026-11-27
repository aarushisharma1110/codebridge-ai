import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, ChevronDown, ChevronUp, CircleHelp, Flame, FolderOpen, KeyRound, LayoutList, LogOut, Menu, MessageCircleQuestion,
  Search, Settings, Star, Tag, User, Users, Activity, Sparkles, UserCog, Trophy
} from 'lucide-react'
import { atLeast, browse, getUsage, USAGE_CHANGED } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { compact, fmt, Notice } from './ui'
import messages from '../../../lang/message/en/messages.json'

const m = messages.q2a
const ChromeContext = createContext({ site: null, categories: [], setRelated: () => {}, refreshCategories: () => {} })
export const useChrome = () => useContext(ChromeContext)

// Main navigation, in Q2A order.
function mainNav(user) {
  const items = [
    ['activity', '/', m.nav.activity, Activity],
    ['questions', '/questions', m.nav.questions, LayoutList],
    ['hot', '/questions?sort=hot', m.nav.hot, Flame],
    ['unanswered', '/unanswered', m.nav.unanswered, CircleHelp],
    ['tag', '/tags', m.nav.tags, Tag],
    ['categories', '/categories', m.nav.categories, FolderOpen],
    ['user', '/users', m.nav.users, Users],
    ['ask', '/ask', m.nav.ask, MessageCircleQuestion],
  ]
  if (user?.role === 'admin' || atLeast(user, 'moderator')) {
    items.push(['admin', user.role === 'admin' ? '/admin' : '/admin/flagged', m.nav.admin, Settings])
  }
  return items
}

function selectedNav(pathname, search) {
  if (pathname === '/') return 'activity'
  if (pathname.startsWith('/questions')) return new URLSearchParams(search).get('sort') === 'hot' ? 'hot' : 'questions'
  if (pathname.startsWith('/unanswered')) return 'unanswered'
  if (pathname.startsWith('/tag')) return 'tag'
  if (pathname.startsWith('/categories')) return 'categories'
  if (pathname.startsWith('/users') || pathname.startsWith('/user/')) return 'user'
  if (pathname.startsWith('/ask')) return 'ask'
  if (pathname.startsWith('/admin')) return 'admin'
  if (/^\/\d+(\/|$)/.test(pathname)) return 'questions' // Q2A highlights Questions on a question page.
  return ''
}

function LoginDropdown({ site, close }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login({ email: form.email.trim(), password: form.password })
      close()
      navigate('/')
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }
  return <div className="qam-account-items" id="qam-account-items">
    <form onSubmit={submit} aria-label={fmt(m.auth.dropdownTitle, { site: site?.site_title || messages.brand.title })}>
      <label htmlFor="qam-login-email">{m.auth.identifier}</label>
      <input type="text" id="qam-login-email" autoComplete="username" value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })} />
      <label htmlFor="qam-login-password">{m.auth.password}</label>
      <input type="password" id="qam-login-password" autoComplete="current-password" value={form.password}
        onChange={(event) => setForm({ ...form, password: event.target.value })} />
      {error && <span className="qa-form-tall-error" role="alert">{error}</span>}
      <button className="qa-form-tall-button qa-form-tall-button-login" disabled={busy}>{busy ? m.auth.loggingIn : m.auth.loginButton}</button>
    </form>
    <ul className="qa-nav-user-list">
      <li className="qa-nav-user-item qa-nav-user-register">
        <Link className="qa-nav-user-link" to="/register" onClick={close}>{m.nav.register}</Link>
      </li>
    </ul>
  </div>
}

function AccountMenu({ close }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [points, setPoints] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    browse.user(user.handle, controller.signal).then((profile) => setPoints(profile.points)).catch(() => {})
    return () => controller.abort()
  }, [user.handle])
  const links = [
    [`/user/${encodeURIComponent(user.handle)}`, m.nav.myProfile, User],
    ['/account', m.nav.myAccount, UserCog],
    ['/favorites', m.nav.myFavorites, Star],
    ['/usage', m.nav.apiUsage, Activity],
    ['/assistant', m.nav.assistant, Sparkles],
  ]
  return <div className="qam-account-items" id="qam-account-items">
    <div className="qa-logged-in"><span className="qa-icon-circle"><User size={14} aria-hidden="true" /></span>
      {fmt(m.nav.loggedInAs, { handle: user.handle })}</div>
    {points !== null && <div className="qam-logged-in-points"><span className="qa-icon-circle"><Trophy size={14} aria-hidden="true" /></span>
      {fmt(m.nav.points, { points: compact(points) })}</div>}
    <ul className="qa-nav-user-list">
      {links.map(([to, label, Icon]) => <li className="qa-nav-user-item" key={to}>
        <Link className="qa-nav-user-link" to={to} onClick={close}>
          <span className="qa-icon-circle"><Icon size={14} aria-hidden="true" /></span>{label}
        </Link>
      </li>)}
      <li className="qa-nav-user-item">
        <button type="button" className="qa-nav-user-link" onClick={async () => {
          close()
          await logout().catch(() => {})
          navigate('/login')
        }}><span className="qa-icon-circle"><LogOut size={14} aria-hidden="true" /></span>{m.nav.logout}</button>
      </li>
    </ul>
  </div>
}

function Topbar({ site }) {
  const { user } = useAuth()
  const { pathname, search } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef(null)
  const selected = selectedNav(pathname, search)

  useEffect(() => { setMenuOpen(false); setAccountOpen(false) }, [pathname, search])
  useEffect(() => {
    if (!accountOpen) return undefined
    const onClick = (event) => { if (!accountRef.current?.contains(event.target)) setAccountOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setAccountOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [accountOpen])

  const title = site?.site_title || messages.brand.title
  return <div id="qam-topbar">
    <div className="qam-main-nav-wrapper">
      <button type="button" className="qam-menu-toggle" aria-expanded={menuOpen} aria-controls="qa-nav-main"
        aria-label={m.nav.menu} onClick={() => setMenuOpen(!menuOpen)}><Menu size={34} aria-hidden="true" /></button>
      <div className="qam-account-items-wrapper" ref={accountRef}>
        <button type="button" id="qam-account-toggle" aria-expanded={accountOpen} aria-controls="qam-account-items"
          onClick={() => setAccountOpen(!accountOpen)} aria-label={user ? m.nav.account : m.nav.login}>
          {user ? <User size={26} aria-hidden="true" /> : <KeyRound size={26} aria-hidden="true" />}
          <span className="qam-account-handle">{user ? user.handle : m.nav.loginLabel}</span>
        </button>
        {accountOpen && (user ? <AccountMenu close={() => setAccountOpen(false)} />
          : <LoginDropdown site={site} close={() => setAccountOpen(false)} />)}
      </div>
      <div className="qa-logo">
        <Link className="qa-logo-link" to="/" title={title}>{title}</Link>
      </div>
      <nav className={'qa-nav-main' + (menuOpen ? ' open' : '')} id="qa-nav-main" aria-label={m.nav.main}>
        <ul className="qa-nav-main-list">
          {mainNav(user).map(([key, to, label, Icon]) => <li key={key} className={`qa-nav-main-item qa-nav-main-${key}`}>
            <Link to={to} className={'qa-nav-main-link' + (selected === key ? ' qa-nav-main-selected' : '')}
              aria-current={selected === key ? 'page' : undefined}>
              <Icon size={24} aria-hidden="true" /> {label}
            </Link>
          </li>)}
        </ul>
      </nav>
    </div>
  </div>
}

// Sub navigation computed from the current page, as Q2A shows under the main navigation.
function subNav(pathname, search, user) {
  const params = new URLSearchParams(search)
  if (pathname.startsWith('/questions')) {
    const sort = params.get('sort') || 'recent'
    return [['recent', pathname, m.nav.recent], ['hot', `${pathname}?sort=hot`, m.nav.hot],
      ['votes', `${pathname}?sort=votes`, m.nav.mostVotes], ['answers', `${pathname}?sort=answers`, m.nav.mostAnswers],
      ['views', `${pathname}?sort=views`, m.nav.mostViews]].map((item) => [...item, item[0] === sort])
  }
  if (pathname.startsWith('/unanswered')) {
    const by = params.get('by') || 'none'
    return [['none', '/unanswered', m.nav.noAnswer], ['selected', '/unanswered?by=selected', m.nav.noSelected],
      ['upvotes', '/unanswered?by=upvotes', m.nav.noUpvoted]].map((item) => [...item, item[0] === by])
  }
  if (pathname.startsWith('/users')) {
    const items = [['/users', m.nav.topUsers], ['/users/newest', m.nav.newestUsers], ['/users/special', m.nav.specialUsers]]
    if (atLeast(user, 'moderator')) items.push(['/users/blocked', m.nav.blockedUsers])
    return items.map(([to, label]) => [to, to, label, pathname === to])
  }
  const profile = pathname.match(/^\/user\/([^/]+)(?:\/(activity|questions|answers))?$/)
  if (profile) {
    const base = `/user/${profile[1]}`
    return [['profile', base, m.user.profile], ['activity', `${base}/activity`, m.user.activity],
      ['questions', `${base}/questions`, m.user.questions], ['answers', `${base}/answers`, m.user.answers]]
      .map((item) => [...item, (profile[2] || 'profile') === item[0]])
  }
  if (pathname.startsWith('/admin')) {
    const items = user?.role === 'admin' ? [
      ['/admin', m.admin.general], ['/admin/users', m.admin.users], ['/admin/categories', m.admin.categories],
      ['/admin/stats', m.admin.stats], ['/admin/flagged', m.admin.flagged], ['/admin/hidden', m.admin.hidden],
      ['/admin/usage', m.admin.usage]] : [['/admin/flagged', m.admin.flagged], ['/admin/hidden', m.admin.hidden]]
    return items.map(([to, label]) => [to, to, label, pathname === to])
  }
  return null
}

function SubNav() {
  const { user } = useAuth()
  const { pathname, search } = useLocation()
  const items = user && subNav(pathname, search, user)
  if (!items) return null
  return <nav className="qa-nav-sub" aria-label={m.nav.sub}>
    <ul className="qa-nav-sub-list">
      {items.map(([key, to, label, selected]) => <li className="qa-nav-sub-item" key={key}>
        <NavLink end to={to} className={'qa-nav-sub-link' + (selected ? ' qa-nav-sub-selected' : '')}
          aria-current={selected ? 'page' : undefined}>{label}</NavLink>
      </li>)}
    </ul>
  </nav>
}

// SnowFlat's small-screen "Ask a Question" bar with a collapsible search box.
function MobileAskSearch() {
  const [open, setOpen] = useState(true)
  return <div className="qam-ask-search-box">
    <div className="qam-ask-mobile">
      <Link to="/ask" className="turquoise">{m.nav.ask}</Link>
      <button type="button" className="qam-ask-search-toggle" aria-expanded={open} aria-controls="qam-search-mobile"
        aria-label={m.askBox.toggleSearch} onClick={() => setOpen(!open)}>
        {open ? <ChevronUp size={30} aria-hidden="true" /> : <ChevronDown size={30} aria-hidden="true" />}
      </button>
    </div>
    {open && <div id="qam-search-mobile"><SearchBox id="qa-search-field-mobile" /></div>}
  </div>
}

function SearchBox({ id = 'qa-search-field' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const [text, setText] = useState(pathname === '/search' ? params.get('q') || '' : '')
  return <div className="qam-search">
    <form className="qa-search" role="search" onSubmit={(event) => {
      event.preventDefault()
      if (text.trim()) navigate(`/search?q=${encodeURIComponent(text.trim())}`)
    }}>
      <label className="sr-only" htmlFor={id}>{m.sidebar.searchLabel}</label>
      <input type="text" id={id} className="qa-search-field" placeholder={m.sidebar.searchPlaceholder}
        value={text} onChange={(event) => setText(event.target.value)} />
      <button type="submit" className="qa-search-button" aria-label={m.sidebar.searchButton}><Search size={18} aria-hidden="true" /></button>
    </form>
  </div>
}

function CategoryWidget({ categories }) {
  const { pathname } = useLocation()
  if (!categories.length) return null
  const top = categories.filter((category) => !category.parent_id)
  const current = decodeURIComponent(pathname.match(/^\/questions\/([^/]+)/)?.[1] || '')
  const item = (category) => <li key={category.id}
    className={'qa-nav-cat-item' + (current === category.slug ? ' qa-nav-cat-selected' : '')}>
    <Link to={`/questions/${encodeURIComponent(category.slug)}`}>{category.title}</Link>
    <span className="qa-nav-cat-note">({compact(category.question_count)})</span>
    {categories.some((child) => child.parent_id === category.id) && <ul className="qa-nav-cat-list">
      {categories.filter((child) => child.parent_id === category.id).map(item)}
    </ul>}
  </li>
  return <div className="qa-nav-cat">
    <h2>{m.sidebar.categories}</h2>
    <ul className="qa-nav-cat-list">
      <li className={'qa-nav-cat-item' + (pathname === '/questions' ? ' qa-nav-cat-selected' : '')}>
        <Link to="/questions">{m.sidebar.allCategories}</Link>
      </li>
      {top.map(item)}
    </ul>
  </div>
}

function Sidepanel({ site, categories, related, open }) {
  const { user } = useAuth()
  const counts = site?.counts
  return <aside className={'qa-sidepanel' + (open ? ' open' : '')} id="qam-sidepanel-mobile" aria-label={m.nav.sidepanel}>
    {user && <SearchBox />}
    {site && site.show_welcome !== 'false' && site.welcome_text && <div className="qa-sidebar">
      {site.welcome_text.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>}
    {related && <div className="qa-widget-side qa-widget-side-low">
      <h2>{m.sidebar.related}</h2>
      {related.length ? <ul className="qa-related-q-list">
        {related.map((question) => <li className="qa-related-q-item" key={question.id}>
          <Link to={`/${question.id}`}>{question.title}</Link>
        </li>)}
      </ul> : <p>{m.sidebar.noRelated}</p>}
    </div>}
    {user && <CategoryWidget categories={categories} />}
    {counts && <div className="qa-activity-count">
      {[['questions', m.sidebar.activityQuestions], ['answers', m.sidebar.activityAnswers],
        ['comments', m.sidebar.activityComments], ['users', m.sidebar.activityUsers]].map(([key, label]) =>
        <p className="qa-activity-count-item" key={key}><span className="qa-activity-count-data">{compact(counts[key])}</span>{label}</p>)}
    </div>}
  </aside>
}

function Footer({ site }) {
  const docs = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1'))
    .replace(/\/api\/v1\/?$/, '') + '/doc/'
  return <footer className="qam-footer-box">
    <div className="qa-footer">
      <div className="qa-nav-footer">
        <ul className="qa-nav-footer-list">
          <li><a href={docs}>{m.footer.apiDocs}</a></li>
        </ul>
      </div>
      {site?.footer_text && <div>{site.footer_text}</div>}
      <div className="qa-attribution">{m.footer.attribution}</div>
    </div>
  </footer>
}

function UsageNotice() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [usage, setUsage] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!user) { setUsage(null); return undefined }
    let latest = 0
    const controller = new AbortController()
    function refresh() {
      const version = ++latest
      getUsage(controller.signal).then((value) => {
        if (!controller.signal.aborted && version === latest) setUsage(value)
      }).catch(() => {})
    }
    refresh()
    window.addEventListener(USAGE_CHANGED, refresh)
    return () => { controller.abort(); window.removeEventListener(USAGE_CHANGED, refresh) }
  }, [user])
  useEffect(() => setDismissed(false), [pathname])
  if (!usage?.allowanceExhausted || dismissed || pathname === '/usage') return null
  return <Notice kind="notice" onClose={() => setDismissed(true)}>
    {messages.analytics.thresholdReached} <Link to="/usage">{m.nav.apiUsage}</Link>
  </Notice>
}

export function Layout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [site, setSite] = useState(null)
  const [categories, setCategories] = useState([])
  const [categoryVersion, setCategoryVersion] = useState(0)
  const [related, setRelated] = useState(null)
  const [sideOpen, setSideOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    browse.site(controller.signal).then(setSite).catch(() => {})
    return () => controller.abort()
  }, [user?.id, categoryVersion])
  useEffect(() => {
    if (!user) { setCategories([]); return undefined }
    const controller = new AbortController()
    browse.categories(controller.signal).then(setCategories).catch(() => {})
    return () => controller.abort()
  }, [user, categoryVersion])
  useEffect(() => { setSideOpen(false); setRelated(null) }, [pathname])
  useEffect(() => {
    if (site?.site_title) document.title = site.site_title
  }, [site])

  const chrome = { site, categories, setRelated, refreshCategories: () => setCategoryVersion((value) => value + 1) }
  const fullWidth = pathname.startsWith('/user/')
  return <ChromeContext.Provider value={chrome}>
    <a className="skip-link" href="#qa-main">{m.nav.skip}</a>
    <Topbar site={site} />
    <SubNav />
    <UsageNotice />
    <div className="qa-body-wrapper">
      {user && <MobileAskSearch />}
      <div className="qa-main-wrapper">
        <main className={'qa-main' + (fullWidth ? ' qa-main-full' : '')} id="qa-main" tabIndex={-1}>
          <Outlet />
        </main>
        {!fullWidth && <>
          <button type="button" id="qam-sidepanel-toggle" aria-expanded={sideOpen} aria-controls="qam-sidepanel-mobile"
            aria-label={m.nav.sidepanel} onClick={() => setSideOpen(!sideOpen)}><ChevronLeft size={22} aria-hidden="true" /></button>
          <Sidepanel site={site} categories={categories} related={related} open={sideOpen} />
        </>}
      </div>
    </div>
    <Footer site={site} />
  </ChromeContext.Provider>
}
