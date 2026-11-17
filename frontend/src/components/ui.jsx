import { ExternalLink } from 'lucide-react'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
export function DateValue({ value }) {
  const date = value && new Date(value)
  return date && Number.isFinite(date.getTime())
    ? <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>
    : 'Unavailable'
}

export function PageHeading({ title, description, action, eyebrow }) {
  return <header className="page-heading">
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {action}
  </header>
}

export function Notice({ children, kind = 'info' }) {
  return <div className={'notice ' + kind} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function EmptyState({ icon: Icon = ExternalLink, title, children, action }) {
  return <div className="empty-state">
    <span className="feature-icon"><Icon size={23} aria-hidden="true" /></span>
    <h2>{title}</h2>
    {children && <p>{children}</p>}
    {action}
  </div>
}

export function Resource({ state, label, children }) {
  if (state.loading) return <div className="loading" role="status">
    <span className="spinner" aria-hidden="true" /> Loading {label}…
  </div>
  if (state.error) return <Notice kind="error">
    <div>{state.error}</div>
    <button className="button secondary small" onClick={state.retry}>Try again</button>
  </Notice>
  return children(state.data)
}
