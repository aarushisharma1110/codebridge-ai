import { useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Activity, FileText, Menu, Shield, Sparkles, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DateValue, Notice, PageHeading } from './ui'

const navigation = [
  ['/questions', 'My Questions', FileText],
  ['/assistant', 'AI Assistant', Sparkles],
  ['/usage', 'API Usage', Activity],
  ['/admin', 'Administration', Shield],
]

export function Brand({ to = '/' }) {
  return <Link className="brand" to={to}>
    <img src="/codebridge.svg" width="37" height="37" alt="" />
    <span>CodeBridge <span className="brand-ai">AI</span></span>
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
        {open ? <X size={18} /> : <Menu size={18} />} Menu
      </button>
      <nav className={'nav-links' + (open ? ' open' : '')} id="primary-nav" aria-label="Primary">
        {navigation.filter(([path]) => path !== '/admin' || user.role === 'admin').map(([path, label, Icon]) =>
          <NavLink key={path} to={path} onClick={() => setOpen(false)}>
            <Icon size={17} aria-hidden="true" /> {label}
          </NavLink>)}
        <NavLink className="account-link" to="/profile" onClick={() => setOpen(false)}>
          <span className="avatar" aria-hidden="true">{user.email.slice(0, 1).toUpperCase()}</span>
          Profile
        </NavLink>
      </nav>
    </div>
  </header>
}

export function Layout() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <Navigation />
    <main className="workspace" id="main" tabIndex={-1}><Outlet /></main>
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
    <PageHeading title="Profile" description="View your account details and manage your session." />
    <section className="panel padded">
      <h2>Account details</h2>
      <dl className="profile-details">
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Role</dt><dd>{user.role === 'admin' ? 'Administrator' : 'Member'}</dd></div>
        <div><dt>Member since</dt><dd><DateValue value={user.created_at} /></dd></div>
      </dl>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="button secondary" disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Log out'}</button>
    </section>
  </div>
}
