import { useState } from 'react'
import { Link } from 'react-router-dom'
import { admin, answers as answerApi, atLeast, browse, comments as commentApi, getUsage, questions } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoad } from '../hooks/useResource'
import { useChrome } from '../components/Layout'
import { compact, fmt, Heading, Notice, Resource, Table, When, questionUrl } from '../components/ui'
import messages from '../../../lang/message/en/messages.json'
import { htmlToText } from '../components/RichEditor'

const m = messages.q2a
const a = messages.analytics
const count = (value) => value.toLocaleString()

function AdminHeading({ section }) {
  return <Heading>{fmt(m.headings.admin, { section })}</Heading>
}

export function AdminGate({ level = 'admin', children }) {
  const { user } = useAuth()
  const allowed = level === 'admin' ? user.role === 'admin' : atLeast(user, level)
  if (!allowed) return <>
    <Heading>{m.nav.admin}</Heading>
    <Notice kind="error">{level === 'admin' ? m.admin.adminOnly : m.admin.moderatorOnly}</Notice>
  </>
  return children
}

export function AdminGeneral() {
  const state = useLoad((signal) => admin.options(signal), [])
  const { refreshCategories } = useChrome()
  const [status, setStatus] = useState(null)
  return <>
    <AdminHeading section={m.admin.general} />
    <Resource state={state}>{(options) => <form className="qa-part-form" onSubmit={async (event) => {
      event.preventDefault()
      setStatus(null)
      try {
        state.setData(await admin.updateOptions(options))
        refreshCategories()
        setStatus({ kind: 'success', text: m.admin.saved })
      } catch (failure) {
        setStatus({ kind: 'error', text: failure.message })
      }
    }}>
      {status && <Notice kind={status.kind}>{status.text}</Notice>}
      <table className="qa-form-wide-table"><tbody>
        <tr><th className="qa-form-wide-label"><label htmlFor="opt-title">{m.admin.siteTitle}</label></th>
          <td className="qa-form-wide-data"><input id="opt-title" className="qa-form-wide-text" maxLength={80} value={options.site_title}
            onChange={(event) => state.setData({ ...options, site_title: event.target.value })} /></td></tr>
        <tr><th className="qa-form-wide-label"><label htmlFor="opt-welcome">{m.admin.welcome}</label></th>
          <td className="qa-form-wide-data"><textarea id="opt-welcome" className="qa-form-wide-text" rows={4} maxLength={2000}
            value={options.welcome_text} onChange={(event) => state.setData({ ...options, welcome_text: event.target.value })} />
            <label className="qa-checkbox-label"><input type="checkbox" checked={options.show_welcome !== 'false'}
              onChange={(event) => state.setData({ ...options, show_welcome: String(event.target.checked) })} /> {m.admin.showWelcome}</label>
          </td></tr>
        <tr><th className="qa-form-wide-label"><label htmlFor="opt-footer">{m.admin.footer}</label></th>
          <td className="qa-form-wide-data"><input id="opt-footer" className="qa-form-wide-text" maxLength={400} value={options.footer_text}
            onChange={(event) => state.setData({ ...options, footer_text: event.target.value })} /></td></tr>
      </tbody></table>
      <div className="qa-form-tall-buttons"><button className="qa-form-wide-button qa-form-wide-button-save">{m.admin.saveOptions}</button></div>
    </form>}</Resource>
  </>
}

export function AdminUsers() {
  const directory = useLoad((signal) => admin.users(signal), [])
  const ranked = useLoad(async (signal) => {
    const rows = []
    for (let page = 1; page <= 20; page += 1) {
      const data = await browse.users({ sort: 'newest', page }, signal)
      rows.push(...data.users)
      if (rows.length >= data.total) break
    }
    return rows
  }, [])
  const [query, setQuery] = useState('')
  return <>
    <AdminHeading section={m.admin.users} />
    <div className="qa-part-form">
      <h2>{m.admin.userTable}</h2>
      <div className="qa-filter-row">
        <label htmlFor="user-filter">{a.filterByEmail}</label>
        <input id="user-filter" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <Resource state={ranked}>{(users) => <Resource state={directory}>{(data) => {
        const emails = new Map((data?.users || []).map((row) => [row.id, row.email]))
        const text = query.trim().toLowerCase()
        const rows = users.filter((row) => !text || row.handle.toLowerCase().includes(text) ||
          (emails.get(row.id) || '').includes(text))
        return <Table label={m.admin.userTable} empty={a.noMatchingAccounts}
          columns={[m.admin.handle, m.admin.email, m.admin.level, m.admin.points, m.admin.joined, m.admin.status]}
          rows={rows.map((row) => [row.id, <Link to={`/user/${encodeURIComponent(row.handle)}`}>{row.handle}</Link>,
            emails.get(row.id) || '', m.user.titles[row.role], compact(row.points), <When value={row.created_at} className="" />,
            row.blocked ? m.admin.blockedStatus : m.admin.active])} />
      }}</Resource>}</Resource>
    </div>
  </>
}

const emptyCategory = { title: '', slug: '', description: '', parent_id: '', position: 0 }

export function AdminCategories() {
  const state = useLoad((signal) => browse.categories(signal), [])
  const { refreshCategories } = useChrome()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyCategory)
  const [status, setStatus] = useState(null)
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value })
  function edit(category) {
    setEditing(category?.id ?? 'new')
    setForm(category ? { title: category.title, slug: category.slug, description: category.description,
      parent_id: category.parent_id ?? '', position: category.position } : emptyCategory)
    setStatus(null)
  }
  async function save(event) {
    event.preventDefault()
    const body = { ...form, parent_id: form.parent_id === '' ? null : Number(form.parent_id), position: Number(form.position) || 0 }
    try {
      if (editing === 'new') await admin.createCategory(body)
      else await admin.updateCategory(editing, body)
      setEditing(null)
      setStatus({ kind: 'success', text: m.admin.categorySaved })
      state.retry()
      refreshCategories()
    } catch (failure) {
      setStatus({ kind: 'error', text: failure.message })
    }
  }
  async function remove(category) {
    if (!window.confirm(fmt(m.admin.confirmDeleteCategory, { title: category.title }))) return
    try {
      await admin.deleteCategory(category.id)
      setEditing(null)
      state.retry()
      refreshCategories()
    } catch (failure) {
      setStatus({ kind: 'error', text: failure.message })
    }
  }
  return <>
    <AdminHeading section={m.admin.categories} />
    {status && <Notice kind={status.kind}>{status.text}</Notice>}
    <Resource state={state}>{(categories) => <>
      {editing !== null && <form className="qa-part-form" onSubmit={save}>
        <h2>{editing === 'new' ? m.admin.addCategory : m.admin.editCategory}</h2>
        <table className="qa-form-wide-table"><tbody>
          <tr><th className="qa-form-wide-label"><label htmlFor="cat-title">{m.admin.categoryName}</label></th>
            <td className="qa-form-wide-data"><input id="cat-title" className="qa-form-wide-text" maxLength={80} required value={form.title} onChange={set('title')} /></td></tr>
          <tr><th className="qa-form-wide-label"><label htmlFor="cat-slug">{m.admin.categorySlug}</label></th>
            <td className="qa-form-wide-data"><input id="cat-slug" className="qa-form-wide-text" maxLength={80} value={form.slug} onChange={set('slug')} /></td></tr>
          <tr><th className="qa-form-wide-label"><label htmlFor="cat-parent">{m.admin.categoryParent}</label></th>
            <td className="qa-form-wide-data"><select id="cat-parent" value={form.parent_id} onChange={set('parent_id')}>
              <option value="">{m.admin.noParent}</option>
              {categories.filter((category) => !category.parent_id && category.id !== editing).map((category) =>
                <option key={category.id} value={category.id}>{category.title}</option>)}
            </select></td></tr>
          <tr><th className="qa-form-wide-label"><label htmlFor="cat-description">{m.admin.categoryDescription}</label></th>
            <td className="qa-form-wide-data"><textarea id="cat-description" className="qa-form-wide-text" rows={3} maxLength={800}
              value={form.description} onChange={set('description')} /></td></tr>
          <tr><th className="qa-form-wide-label"><label htmlFor="cat-position">{m.admin.categoryPosition}</label></th>
            <td className="qa-form-wide-data"><input id="cat-position" type="number" style={{ width: 80 }} value={form.position} onChange={set('position')} /></td></tr>
        </tbody></table>
        <div className="qa-form-tall-buttons">
          <button className="qa-form-wide-button qa-form-wide-button-save">{m.admin.saveCategory}</button>
          {editing !== 'new' && <button type="button" className="qa-form-wide-button qa-form-wide-button-cancel"
            onClick={() => remove(categories.find((category) => category.id === editing))}>{m.admin.deleteCategory}</button>}
          <button type="button" className="qa-form-wide-button" onClick={() => setEditing(null)}>{m.question.cancel}</button>
        </div>
      </form>}
      <div className="qa-part-nav-list">
        {categories.length ? <ul className="qa-browse-cat-list">
          {categories.filter((category) => !category.parent_id).map((category) => <li className="qa-browse-cat-item" key={category.id}>
            <Link className="qa-browse-cat-link" to={`/questions/${encodeURIComponent(category.slug)}`}>{category.title}</Link>{' '}
            <button type="button" className="qa-small-button" onClick={() => edit(category)}>{m.admin.categoryEditLink}</button>
            <span className="qa-browse-cat-note">{compact(category.question_count)} {m.list.questionsCount}</span>
            <ul className="qa-browse-cat-list">
              {categories.filter((child) => child.parent_id === category.id).map((child) => <li className="qa-browse-cat-item" key={child.id}>
                <Link className="qa-browse-cat-link" to={`/questions/${encodeURIComponent(child.slug)}`}>{child.title}</Link>{' '}
                <button type="button" className="qa-small-button" onClick={() => edit(child)}>{m.admin.categoryEditLink}</button>
                <span className="qa-browse-cat-note">{compact(child.question_count)} {m.list.questionsCount}</span>
              </li>)}
            </ul>
          </li>)}
        </ul> : <p>{m.list.emptyCategories}</p>}
        <div className="qa-form-tall-buttons">
          <button type="button" className="qa-form-wide-button qa-form-wide-button-save" onClick={() => edit(null)}>{m.admin.addCategory}</button>
        </div>
      </div>
    </>}</Resource>
  </>
}

export function AdminStats() {
  const stats = useLoad((signal) => admin.stats(signal), [])
  const counts = useLoad((signal) => admin.counts(signal), [])
  return <>
    <AdminHeading section={m.admin.stats} />
    <div className="qa-part-form">
      <Resource state={stats}>{(data) => <table className="qa-form-wide-table"><tbody>
        {Object.entries(m.admin.statsLabels).map(([key, label]) => <tr key={key}>
          <th className="qa-form-wide-label">{label}</th><td className="qa-form-wide-data"><strong>{count(data[key] ?? 0)}</strong></td>
        </tr>)}
      </tbody></table>}</Resource>
      <Resource state={counts}>{(data) => <dl className="qa-metrics" style={{ marginTop: 10 }}>
        <div><dt>{a.members}</dt><dd>{count(data.users)}</dd></div>
        <div><dt>{a.administrators}</dt><dd>{count(data.admins)}</dd></div>
      </dl>}</Resource>
    </div>
  </>
}

// Flagged and hidden posts share one list with moderation actions.
function ModerationList({ load, emptyText, section, hiddenList }) {
  const { user } = useAuth()
  const state = useLoad(load, [])
  const [error, setError] = useState('')
  const act = (fn) => async () => {
    setError('')
    try { await fn(); state.retry() } catch (failure) { setError(failure.message) }
  }
  return <>
    <AdminHeading section={section} />
    {error && <Notice kind="error">{error}</Notice>}
    <Resource state={state}>{(data) => {
      const items = [
        ...data.questions.map((post) => ({ kind: 'question', post, title: post.title, link: questionUrl(post) })),
        ...data.answers.map((post) => ({ kind: 'answer', post, title: post.question_title, link: `/${post.question_id}#a${post.id}` })),
        ...data.comments.map((post) => ({ kind: 'comment', post, title: post.question_title, link: `/${post.question_id}#c${post.id}` })),
      ]
      if (!items.length) return <Notice kind="warning">{emptyText}</Notice>
      const api = { question: questions, answer: answerApi, comment: commentApi }
      return items.map(({ kind, post, title, link }) => <div className="qa-mod-item" key={`${kind}${post.id}`}>
        <div className="qa-post-meta">
          <span className="qa-mod-type">{{ question: m.admin.postQuestion, answer: m.admin.postAnswer, comment: m.admin.postComment }[kind]}</span>
          <Link to={link}><strong>{kind === 'question' ? title : fmt(m.admin.onQuestion, { title })}</strong></Link>
          {' · '}<When value={post.created_at} /> {m.meta.by} <Link to={`/user/${encodeURIComponent(post.author_handle)}`}>{post.author_handle}</Link>
          {post.flag_count > 0 && <span className="qa-q-item-flags">{post.flag_count === 1 ? m.meta.flag : fmt(m.meta.flags, { count: post.flag_count })}</span>}
        </div>
        {kind !== 'question' && <div className="prewrap" style={{ fontSize: 14, marginBottom: 6 }}>{(post.format === 'html' ? htmlToText(post.body) : post.body).slice(0, 400)}</div>}
        <div className="qa-inline-form">
          {hiddenList ? <>
            <button type="button" className="qa-small-button" onClick={act(() => api[kind].reshow(post.id))}>{m.question.reshow}</button>
            {atLeast(user, 'moderator') && <button type="button" className="qa-small-button qa-small-button-danger"
              onClick={() => window.confirm(m[kind].confirmDelete) && act(() => api[kind].remove(post.id))()}>{m.question.delete}</button>}
          </> : <>
            <button type="button" className="qa-small-button" onClick={act(() => api[kind].clearFlags(post.id))}>{m.question.clearFlags}</button>
            <button type="button" className="qa-small-button qa-small-button-danger" onClick={act(() => api[kind].hide(post.id))}>{m.question.hide}</button>
          </>}
        </div>
      </div>)
    }}</Resource>
  </>
}

export const AdminFlagged = () => <ModerationList load={admin.flagged} emptyText={m.admin.noFlagged} section={m.admin.flagged} />
export const AdminHidden = () => <ModerationList load={admin.hidden} emptyText={m.admin.noHidden} section={m.admin.hidden} hiddenList />

function EndpointTable({ rows }) {
  return <Table label={a.requestsByEndpoint} empty={a.empty}
    columns={[a.method, a.endpoint, a.requests, a.errors]}
    rows={rows.map((row) => [`${row.method} ${row.endpoint}`, <span className="qa-pill">{row.method}</span>,
      <code>{row.endpoint}</code>, count(row.count), Number.isSafeInteger(row.errorCount) ? count(row.errorCount) : messages.common.unavailable])} />
}

export function AdminUsage() {
  const usage = useLoad((signal) => admin.usage(signal), [])
  const [endpoint, setEndpoint] = useState('')
  return <>
    <AdminHeading section={m.admin.usage} />
    <Resource state={usage}>{(data) => data ? <>
      <div className="qa-part-form">
        <h2>{a.usageByUser}</h2>
        <Table label={a.usageByUser} empty={a.empty} columns={[a.user, messages.common.email, a.eligibleCalls]}
          rows={data.byUser.map((row) => [row.user_id, row.user_id, row.email, count(row.count)])} />
      </div>
      <div className="qa-part-form">
        <h2>{a.usageByEndpoint}</h2>
        <div className="qa-filter-row"><label htmlFor="endpoint-filter">{a.filterEndpoints}</label>
          <input id="endpoint-filter" type="search" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></div>
        <EndpointTable rows={data.byEndpoint.filter((row) => `${row.method} ${row.endpoint}`.toLowerCase().includes(endpoint.trim().toLowerCase()))} />
      </div>
    </> : <Notice kind="warning">{a.perUserUnavailable}</Notice>}</Resource>
  </>
}

export function UsagePage() {
  const state = useLoad((signal) => getUsage(signal), [])
  return <>
    <Heading>{m.nav.apiUsage}</Heading>
    <Resource state={state}>{(usage) => usage ? <>
      <div className="qa-part-form">
        <h2>{a.accountUsage}</h2>
        <dl className="qa-metrics">
          <div><dt>{a.eligibleCalls}</dt><dd>{count(usage.totalUsage)}</dd></div>
          <div><dt>{a.threshold}</dt><dd>{count(usage.freeAllowance)}</dd></div>
          <div><dt>{a.callsBeforeNotice}</dt><dd>{count(usage.remainingCalls)}</dd></div>
        </dl>
        <progress className="qa-progress" aria-label={a.progress} value={Math.min(usage.totalUsage, usage.freeAllowance)} max={usage.freeAllowance} />
        {usage.remainingCalls === 0 && <Notice kind="notice">{a.thresholdReached}</Notice>}
        <p className="qa-fine-print">{a.noticeExplanation}</p>
      </div>
      {usage.breakdown && <div className="qa-part-form"><h2>{a.breakdown}</h2><EndpointTable rows={usage.breakdown} /></div>}
      <p className="qa-fine-print">{a.excluded}</p>
    </> : <Notice kind="warning">{a.usageUnavailable}</Notice>}</Resource>
  </>
}
