import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, FileText, Menu, Shield, Sparkles, X } from 'lucide-react'
import { getUsage, USAGE_CHANGED } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { DateValue, Notice, PageHeading } from './ui'
import messages from '../../../lang/message/en/messages.json'

const navigation = [
  ['/questions', messages.layout.questions, FileText],
  ['/assistant', messages.layout.assistant, Sparkles],
  ['/usage', messages.layout.usage, Activity],
  ['/admin', messages.layout.admin, Shield],
]

export function Brand({ to = '/' }) {
  return <Link className="brand" to={to}>
    <img src="/codebridge.svg" width="37" height="37" alt="" />
    <span>{messages.brand.name} <span className="brand-ai">{messages.brand.suffix}</span></span>
  </Link>
}

function Navigation() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const toggle = useRef(null)
  return <header className="topbar" onKeyDown={(event) => {
    if (open && event.key === 'Escape') {
      setOpen(false)
      toggle.current?.focus()
    }
  }}>
    <div className="nav-frame">
      <Brand />
      <button className="button secondary menu-toggle" ref={toggle} aria-expanded={open} aria-controls="primary-nav"
        onClick={() => setOpen(!open)}>
        {open ? <X size={18} /> : <Menu size={18} />} {messages.layout.menu}
      </button>
      <nav className={'nav-links' + (open ? ' open' : '')} id="primary-nav" aria-label={messages.layout.primaryNav}>
        {navigation.filter(([path]) => path !== '/admin' || user.role === 'admin').map(([path, label, Icon]) =>
          <NavLink key={path} to={path} onClick={() => setOpen(false)}>
            <Icon size={17} aria-hidden="true" /> {label}
          </NavLink>)}
        <NavLink className="account-link" to="/profile" onClick={() => setOpen(false)}>
          <span className="avatar" aria-hidden="true">{user.email.slice(0, 1).toUpperCase()}</span>
          {messages.layout.profile}
        </NavLink>
      </nav>
    </div>
  </header>
}

export function Layout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [usage, setUsage] = useState(null)
  const [usageError, setUsageError] = useState('')
  useEffect(() => {
    let latest = 0
    const controller = new AbortController()
    function refresh() {
      const version = ++latest
      getUsage(controller.signal).then((value) => {
        if (!controller.signal.aborted && version === latest) { setUsage(value); setUsageError('') }
      }).catch((error) => {
        if (!controller.signal.aborted && version === latest) setUsageError(error.message)
      })
    }
    setUsage(null)
    setUsageError('')
    if (pathname === '/usage') return () => controller.abort()
    refresh()
    window.addEventListener(USAGE_CHANGED, refresh)
    return () => { controller.abort(); window.removeEventListener(USAGE_CHANGED, refresh) }
  }, [user.id, pathname])
  return <>
    <a className="skip-link" href="#main">{messages.layout.skip}</a>
    <Navigation />
    <main className="workspace" id="main" tabIndex={-1}>
      {usage?.allowanceExhausted && <Notice>{messages.analytics.thresholdReached}</Notice>}
      {usageError && <Notice kind="error">{usageError}</Notice>}
      <Outlet />
    </main>
  </>
}

export function Profile() {
  const { user, logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    setBusy(true)
    setError('')
    try {
      await logout()
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return <div className="narrow">
    <PageHeading title={messages.layout.profile} description={messages.layout.profileDescription} />
    <section className="panel padded">
      <h2>{messages.layout.accountDetails}</h2>
      <dl className="profile-details">
        <div><dt>{messages.common.email}</dt><dd>{user.email}</dd></div>
        <div><dt>{messages.common.role}</dt><dd>{user.role === 'admin' ? messages.common.admin : messages.common.member}</dd></div>
        <div><dt>{messages.layout.memberSince}</dt><dd><DateValue value={user.created_at} /></dd></div>
      </dl>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="button secondary" disabled={busy} onClick={signOut}>{busy ? messages.layout.signingOut : messages.layout.logOut}</button>
    </section>
  </div>
}
