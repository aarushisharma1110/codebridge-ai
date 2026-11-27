import { useCallback } from 'react'
import { sanitize } from './RichEditor'
import { Link, useLocation } from 'react-router-dom'
import messages from '../../../lang/message/en/messages.json'
import { formatMessage } from '../formatMessage'

const m = messages.q2a

export const fmt = formatMessage

// Q2A shows compact counts in lists ("1.2k").
export function compact(value) {
  const number = Number(value) || 0
  if (Math.abs(number) < 1000) return String(number)
  return (number / 1000).toFixed(number < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k'
}

export const plural = (count, one, many) => (count === 1 ? one : many)

const fullDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })

// Relative times for the last week, then dates, as qa_when_to_html does.
export function whenText(value, now = Date.now()) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000))
  if (seconds < 10) return m.meta.justNow
  if (seconds < 60) return fmt(m.meta.secondsAgo, { count: seconds })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes === 1 ? m.meta.minuteAgo : fmt(m.meta.minutesAgo, { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? m.meta.hourAgo : fmt(m.meta.hoursAgo, { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return days === 1 ? m.meta.dayAgo : fmt(m.meta.daysAgo, { count: days })
  return (date.getFullYear() === new Date(now).getFullYear() ? shortDate : fullDate).format(date)
}

// Q2A bolds the amount and leaves " ago" plain: <b>1 day</b> ago.
export function When({ value, className = 'qa-q-item-when-data' }) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const text = whenText(value)
  const relative = text.endsWith(m.meta.agoSuffix)
  return <span className="qa-q-item-when">
    <time className={className} dateTime={date.toISOString()} title={fullDate.format(date)}>
      {relative ? text.slice(0, -m.meta.agoSuffix.length) : text}
    </time>{relative && m.meta.agoSuffix}
  </span>
}

// Q2A's default avatar for users without a picture.
export function Avatar({ size = 20 }) {
  return <svg className="qa-avatar-image" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <rect width="20" height="20" fill="#e3e3e3" />
    <circle cx="10" cy="7.5" r="3.6" fill="#a9a9a9" />
    <path d="M3 20c0-4.4 3.1-7.2 7-7.2s7 2.8 7 7.2z" fill="#a9a9a9" />
  </svg>
}

export function UserLink({ handle }) {
  if (!handle) return <span>{m.meta.anonymous}</span>
  return <Link className="qa-user-link" to={`/user/${encodeURIComponent(handle)}`}>{handle}</Link>
}

export function Points({ points }) {
  if (points === undefined || points === null) return null
  return <span className="qa-points"> {fmt(m.meta.points, { points: compact(points) })}</span>
}

export function Notice({ kind = 'error', children, onClose }) {
  const className = { error: 'qa-error', success: 'qa-success', warning: 'qa-warning', notice: 'qa-notice' }[kind]
  return <div className={className} role={kind === 'error' ? 'alert' : 'status'}>
    {children}
    {onClose && <button type="button" className="qa-notice-close-button" aria-label={m.notice.close} onClick={onClose}>×</button>}
  </div>
}

export function Loading() {
  return <div className="qa-waiting" role="status">{m.misc.loading}</div>
}

export function Resource({ state, children }) {
  if (state.loading) return <Loading />
  if (state.error) return <Notice kind="error">
    {state.error}
    <button type="button" className="qa-retry" onClick={state.retry}>{m.misc.retry}</button>
  </Notice>
  return children(state.data)
}

export function Heading({ children, extra, hidden = false }) {
  return <div className={'qa-main-heading' + (hidden ? ' qa-main-hidden' : '')}>
    <h1 id="page-heading" tabIndex={-1}>{children}</h1>
    {extra}
  </div>
}

// Q2A page links: « prev 1 2 3 … 9 next »
export function PageLinks({ page, total, pageSize }) {
  const { pathname, search } = useLocation()
  const pages = Math.ceil(total / pageSize)
  const href = useCallback((target) => {
    const params = new URLSearchParams(search)
    if (target === 1) params.delete('page')
    else params.set('page', target)
    const text = params.toString()
    return pathname + (text ? `?${text}` : '')
  }, [pathname, search])
  if (pages <= 1) return null
  const shown = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])]
    .filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b)
  const items = []
  shown.forEach((value, index) => {
    if (index && value - shown[index - 1] > 1) items.push(<li key={`gap${value}`}><span className="qa-page-ellipsis">…</span></li>)
    items.push(<li className="qa-page-links-item" key={value}>
      {value === page ? <span className="qa-page-selected" aria-current="page">{value}</span>
        : <Link to={href(value)}>{value}</Link>}
    </li>)
  })
  return <nav className="qa-page-links" aria-label={m.pages.label}>
    <ul className="qa-page-links-list">
      {page > 1 && <li className="qa-page-links-item"><Link to={href(page - 1)}>{m.pages.prev}</Link></li>}
      {items}
      {page < pages && <li className="qa-page-links-item"><Link to={href(page + 1)}>{m.pages.next}</Link></li>}
    </ul>
  </nav>
}

// Plain-text post content: paragraphs, line breaks and clickable http(s) links.
const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/g
export function PostContent({ text, format = '', className = '' }) {
  if (!text) return null
  if (format === 'html') return <div className={'qa-post-content ' + className} dangerouslySetInnerHTML={{ __html: sanitize(text) }} />
  return <div className={'qa-post-content ' + className}>
    {text.split(/\n{2,}/).map((paragraph, index) => <p key={index} className="prewrap">
      {paragraph.split(URL_PATTERN).map((part, partIndex) => partIndex % 2
        ? <a key={partIndex} href={part} rel="nofollow noopener noreferrer" target="_blank">{part}</a>
        : part)}
    </p>)}
  </div>
}

export function Table({ label, columns, rows, empty }) {
  if (!rows.length) return <p>{empty}</p>
  return <div className="qa-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className="qa-table">
      <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{rows.map(([key, ...cells]) => <tr key={key}>
        {cells.map((cell, index) => <td key={columns[index]}>{cell}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
}

export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}
export const questionUrl = (question) => `/${question.id}/${slugify(question.title || '') || 'question'}`
