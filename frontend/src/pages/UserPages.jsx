import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import { admin, auth, browse, LEVELS, questions } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoad } from '../hooks/useResource'
import { QuestionItem, QuestionList } from '../components/q2a'
import { compact, fmt, Heading, Notice, PageLinks, plural, Resource, When } from '../components/ui'
import { validPasswordLength } from './AuthPages'
import { htmlToText } from '../components/RichEditor'
import messages from '../../../lang/message/en/messages.json'

const m = messages.q2a

const excerpt = (html) => {
  const text = htmlToText(html)
  return text.length > 300 ? text.slice(0, 300) + '…' : text
}

function memberFor(created) {
  const days = Math.floor((Date.now() - new Date(created).getTime()) / 86400000)
  if (days < 1) return m.user.duration.today
  if (days < 60) return fmt(m.user.duration.days, { count: days })
  if (days < 730) return fmt(m.user.duration.months, { count: Math.floor(days / 30) })
  return fmt(m.user.duration.years, { count: Math.floor(days / 365) })
}

function Row({ label, children }) {
  return <tr><th className="qa-form-wide-label" scope="row">{label}</th><td className="qa-form-wide-data">{children}</td></tr>
}

function AdminControls({ profile, onChange }) {
  const [role, setRole] = useState(profile.role)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(changes) {
    setBusy(true)
    setError('')
    try {
      const user = await admin.updateUser(profile.id, changes)
      onChange({ role: user.role, blocked: user.blocked, title: m.user.titles[user.role] })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return <div className="qa-part-form">
    <h2>{m.user.adminSection}</h2>
    <div className="qa-inline-form">
      <label htmlFor="user-level">{m.user.level}</label>
      <select id="user-level" value={role} onChange={(event) => setRole(event.target.value)}>
        {LEVELS.map((level) => <option key={level} value={level}>{m.user.titles[level]}</option>)}
      </select>
      <button type="button" className="qa-form-wide-button" disabled={busy || role === profile.role}
        onClick={() => save({ role })}>{m.user.saveLevel}</button>
      <button type="button" className={'qa-form-wide-button' + (profile.blocked ? ' qa-form-wide-button-save' : ' qa-form-wide-button-cancel')}
        disabled={busy} onClick={() => save({ blocked: !profile.blocked })}>{profile.blocked ? m.user.unblock : m.user.block}</button>
    </div>
    {error && <Notice kind="error">{error}</Notice>}
  </div>
}

function Profile({ handle }) {
  const { user } = useAuth()
  const state = useLoad((signal) => browse.user(handle, signal), [handle])
  const [error, setError] = useState('')
  return <Resource state={state}>{(profile) => {
    const stats = profile.stats
    const own = profile.id === user.id
    async function toggleFavorite() {
      try {
        await browse.favoriteUser(profile.handle, !profile.favorited)
        state.setData({ ...profile, favorited: !profile.favorited })
      } catch (failure) {
        setError(failure.message)
      }
    }
    return <>
      <Heading extra={!own && <div className="qa-favoriting">
        <button type="button" className={profile.favorited ? 'qa-unfavorite-button' : 'qa-favorite-button'} onClick={toggleFavorite}
          title={profile.favorited ? m.user.unfavorite : m.user.favorite} aria-pressed={profile.favorited}
          aria-label={profile.favorited ? m.user.unfavorite : m.user.favorite}>
          <Star size={30} fill={profile.favorited ? 'currentColor' : 'none'} aria-hidden="true" />
        </button></div>}>{fmt(m.headings.user, { handle: profile.handle })}</Heading>
      {error && <Notice kind="error">{error}</Notice>}
      {profile.blocked && <Notice kind="warning">{m.user.blocked}</Notice>}
      <div className="qa-part-form-profile">
        <table className="qa-form-wide-table"><tbody>
          <Row label={m.user.memberFor}>{memberFor(profile.created_at)}</Row>
          <Row label={m.user.type}>{profile.title}</Row>
          {profile.email && <Row label={m.user.email}>{profile.email}</Row>}
          {profile.full_name && <Row label={m.user.fullName}>{profile.full_name}</Row>}
          {profile.location && <Row label={m.user.location}>{profile.location}</Row>}
          {profile.website && <Row label={m.user.website}>
            <a href={profile.website} rel="nofollow noopener noreferrer" target="_blank">{profile.website}</a></Row>}
          {profile.about && <Row label={m.user.about}><span className="prewrap">{profile.about}</span></Row>}
        </tbody></table>
      </div>
      <div className="qa-part-form-activity">
        <h2>{fmt(m.user.activityBy, { handle: profile.handle })}</h2>
        <table className="qa-form-wide-table"><tbody>
          <Row label={m.user.score}><strong>{fmt(m.user.scoreValue, { points: profile.points.toLocaleString(), rank: profile.rank })}</strong></Row>
          <Row label={m.user.questionsLabel}><strong>{stats.qposts}</strong></Row>
          <Row label={m.user.answersLabel}>{fmt(m.user.answersValue, { answers: stats.aposts, selected: stats.aselecteds })}</Row>
          <Row label={m.user.commentsLabel}><strong>{stats.cposts}</strong></Row>
          <Row label={m.user.votedOn}>{fmt(m.user.votedOnValue, { q: stats.qupvotes + stats.qdownvotes, a: stats.aupvotes + stats.adownvotes })}</Row>
          <Row label={m.user.gave}>{fmt(m.user.gaveValue, { up: stats.qupvotes + stats.aupvotes, down: stats.qdownvotes + stats.adownvotes })}</Row>
          <Row label={m.user.received}>{fmt(m.user.receivedValue, { up: stats.upvoteds, down: stats.downvoteds })}</Row>
        </tbody></table>
      </div>
      {user.role === 'admin' && !own && <AdminControls profile={profile}
        onChange={(changes) => state.setData({ ...profile, ...changes })} />}
    </>
  }}</Resource>
}

function UserQuestions({ handle }) {
  const page = useSearchParams()[0].get('page') || undefined
  const state = useLoad((signal) => questions.list({ user: handle, page }, signal), [handle, page])
  return <>
    <Heading>{fmt(m.headings.user, { handle })} — {m.user.questions}</Heading>
    <Resource state={state}>{() => <QuestionList state={state} suggest={false} />}</Resource>
  </>
}

function UserActivity({ handle }) {
  const page = useSearchParams()[0].get('page') || undefined
  const state = useLoad((signal) => browse.userActivity(handle, { page }, signal), [handle, page])
  return <>
    <Heading>{fmt(m.headings.user, { handle })} — {m.user.activity}</Heading>
    <Resource state={state}>{() => <QuestionList state={state} suggest={false} />}</Resource>
  </>
}

function UserAnswers({ handle }) {
  const page = useSearchParams()[0].get('page') || undefined
  const state = useLoad((signal) => browse.userAnswers(handle, { page }, signal), [handle, page])
  return <>
    <Heading>{fmt(m.headings.user, { handle })} — {m.user.answers}</Heading>
    <Resource state={state}>{(data) => data.answers.length ? <>
      {data.answers.map((answer) => <div className="qa-mod-item" key={answer.id}>
        <div className="qa-post-meta">
          {m.user.answerTo} <Link to={`/${answer.question_id}#a${answer.id}`}><strong>{answer.question_title}</strong></Link>
          {' · '}<When value={answer.created_at} /> · {answer.netvotes} {plural(Math.abs(answer.netvotes), m.list.vote, m.list.votes)}
          {answer.selected && <> · <strong style={{ color: '#27ae60' }}>{m.meta.selected}</strong></>}
        </div>
        <div className="prewrap" style={{ fontSize: 14 }}>{excerpt(answer.body)}</div>
      </div>)}
      <PageLinks page={data.page} total={data.total} pageSize={data.pageSize} />
    </> : <Notice kind="warning">{m.user.noAnswers}</Notice>}</Resource>
  </>
}

export function UserPage({ tab = 'profile' }) {
  const { handle } = useParams()
  if (tab === 'questions') return <UserQuestions handle={handle} />
  if (tab === 'activity') return <UserActivity handle={handle} />
  if (tab === 'answers') return <UserAnswers handle={handle} />
  return <Profile key={handle} handle={handle} />
}

export function AccountPage() {
  const { user, updateUser } = useAuth()
  const [form, setForm] = useState({
    handle: user.handle, full_name: user.full_name || '', location: user.location || '',
    website: user.website || '', about: user.about || ''
  })
  const [status, setStatus] = useState(null)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value })

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      updateUser(await auth.updateProfile(form))
      setStatus({ kind: 'success', text: m.account.saved })
    } catch (failure) {
      setStatus({ kind: 'error', text: failure.message })
    } finally {
      setBusy(false)
    }
  }
  async function changePassword(event) {
    event.preventDefault()
    setPasswordStatus(null)
    if (!validPasswordLength(passwords.newPassword)) {
      setPasswordStatus({ kind: 'error', text: m.account.passwordError })
      return
    }
    setBusy(true)
    try {
      await auth.changePassword(passwords)
      setPasswords({ currentPassword: '', newPassword: '' })
      setPasswordStatus({ kind: 'success', text: m.account.passwordChanged })
    } catch (failure) {
      setPasswordStatus({ kind: 'error', text: failure.message })
    } finally {
      setBusy(false)
    }
  }
  const input = (name, label, props = {}) => <tr>
    <th className="qa-form-wide-label" scope="row"><label htmlFor={`account-${name}`}>{label}</label></th>
    <td className="qa-form-wide-data">{props.multiline
      ? <textarea id={`account-${name}`} className="qa-form-wide-text" rows={5} value={form[name]} onChange={set(name)} />
      : <input id={`account-${name}`} className="qa-form-wide-text" value={form[name]} onChange={set(name)} {...props} />}</td>
  </tr>
  return <>
    <Heading>{m.headings.account}</Heading>
    <form className="qa-part-form-profile" onSubmit={save}>
      {status && <Notice kind={status.kind}>{status.text}</Notice>}
      <table className="qa-form-wide-table"><tbody>
        {input('handle', m.account.handle, { autoComplete: 'username' })}
        <tr><th className="qa-form-wide-label" scope="row">{m.account.email}</th><td className="qa-form-wide-data">{user.email}</td></tr>
        <tr><th className="qa-form-wide-label" scope="row">{m.account.type}</th><td className="qa-form-wide-data">{m.user.titles[user.role]}</td></tr>
        {input('full_name', m.account.fullName, { maxLength: 100 })}
        {input('location', m.account.location, { maxLength: 100 })}
        {input('website', m.account.website, { maxLength: 200, type: 'url' })}
        {input('about', m.account.about, { multiline: true })}
      </tbody></table>
      <div className="qa-form-tall-buttons">
        <button className="qa-form-wide-button qa-form-wide-button-save" disabled={busy}>{m.account.save}</button>
      </div>
    </form>
    <form className="qa-part-form-profile" onSubmit={changePassword}>
      <h2>{m.account.passwordSection}</h2>
      {passwordStatus && <Notice kind={passwordStatus.kind}>{passwordStatus.text}</Notice>}
      <table className="qa-form-wide-table"><tbody>
        <tr><th className="qa-form-wide-label" scope="row"><label htmlFor="account-current">{m.account.current}</label></th>
          <td className="qa-form-wide-data"><input id="account-current" type="password" autoComplete="current-password"
            className="qa-form-wide-text" value={passwords.currentPassword}
            onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></td></tr>
        <tr><th className="qa-form-wide-label" scope="row"><label htmlFor="account-new">{m.account.newPassword}</label></th>
          <td className="qa-form-wide-data"><input id="account-new" type="password" autoComplete="new-password"
            className="qa-form-wide-text" value={passwords.newPassword}
            onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></td></tr>
      </tbody></table>
      <div className="qa-form-tall-buttons">
        <button className="qa-form-wide-button" disabled={busy}>{m.account.changePassword}</button>
      </div>
    </form>
  </>
}

export function FavoritesPage() {
  const state = useLoad((signal) => browse.favorites(signal), [])
  return <>
    <Heading>{m.headings.favorites}</Heading>
    <Resource state={state}>{(data) => <>
      <div className="qa-part-form"><h2>{m.favorites.questions}</h2>
        {data.questions.length ? null : <p>{m.favorites.none}</p>}</div>
      {data.questions.map((question) => <QuestionItem key={question.id} question={question} onChange={(next) =>
        state.setData({ ...data, questions: data.questions.map((item) => item.id === next.id ? next : item) })} />)}
      <div className="qa-part-ranking"><h2>{m.favorites.users}</h2>
        {data.users.length ? <ul className="qa-ranking-list">{data.users.map((row) =>
          <li className="qa-ranking-item qa-top-users-item" key={row.id}>
            <span className="qa-top-users-label"><Link className="qa-user-link" to={`/user/${encodeURIComponent(row.handle)}`}>{row.handle}</Link></span>
            <span className="qa-top-users-score">{fmt(m.nav.points, { points: compact(row.points) })}</span>
          </li>)}</ul> : <p>{m.favorites.none}</p>}
      </div>
      <div className="qa-part-ranking"><h2>{m.favorites.tags}</h2>
        {data.tags.length ? <ul className="qa-ranking-list">{data.tags.map(({ tag, count }) =>
          <li className="qa-ranking-item qa-top-tags-item" key={tag}>
            <Link className="qa-tag-link" to={`/tag/${encodeURIComponent(tag)}`}>{tag}</Link>
            <span className="qa-top-tags-count">× {compact(count)}</span>
          </li>)}</ul> : <p>{m.favorites.none}</p>}
      </div>
    </>}</Resource>
  </>
}

