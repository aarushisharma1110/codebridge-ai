import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CircleHelp, FileText, Plus, Search, Trash2 } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useImprovement } from '../hooks/useImprovement'
import { useQuestionDraft } from '../hooks/useQuestionDraft'
import { useResource } from '../hooks/useResource'
import { questions } from '../services/api'
import { DateValue, EmptyState, Notice, PageHeading, Resource } from '../components/ui'
import { cleanQuestion, emptyQuestion, QuestionFields, questionErrors } from '../components/QuestionFields'
import { Improvement, ImproveButton } from '../components/Improvement'
import messages from '../../../lang/message/en/messages.json'
import { formatMessage } from '../formatMessage'

const NewQuestion = () => <Link className="button primary" to="/questions/new">
  <Plus size={18} aria-hidden="true" /> {messages.questions.newQuestion}
</Link>

export function QuestionsPage() {
  const { user } = useAuth()
  const { state } = useLocation()
  const load = useResource(questions.list)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all')

  return <>
    <PageHeading eyebrow={messages.questions.workspace} title={messages.layout.questions}
      description={messages.questions.listDescription} action={<NewQuestion />} />
    {state?.message && <Notice kind="success">{state.message}</Notice>}
    <div className="intro">
      <span className="feature-icon"><CircleHelp size={22} aria-hidden="true" /></span>
      <div><h2>{messages.questions.introTitle}</h2>
        <p>{messages.questions.introDescription}</p></div>
      <Link to="/assistant">{messages.questions.openAssistant} <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>
    <section className="panel question-list" aria-labelledby="question-list-title">
      <div className="list-toolbar">
        <h2 id="question-list-title">{messages.questions.listTitle}</h2>
        <div className="list-controls">
          <div className="scope" role="group" aria-label={messages.questions.ownership}>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>{messages.questions.allVisible}</button>
            <button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>{messages.questions.ownedByMe}</button>
          </div>
          <label className="search-control">
            <Search size={17} aria-hidden="true" />
            <input type="search" aria-label={messages.questions.search} placeholder={messages.questions.search}
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>
      </div>
      <Resource state={load} label={messages.questions.listResource}>{(items) => {
        const query = search.trim().toLowerCase()
        const visible = items.filter((item) => (scope === 'all' || item.user_id === user.id) &&
          (item.title.toLowerCase().includes(query) || item.body.toLowerCase().includes(query)))
        if (!items.length) return <EmptyState icon={FileText} title={messages.questions.empty}>
          {messages.questions.firstQuestion}
        </EmptyState>
        if (!visible.length) return <EmptyState icon={Search} title={query ? messages.questions.noMatches : messages.questions.noOwned}>
          {query ? messages.questions.changeSearch : messages.questions.createOne}
        </EmptyState>
        return <ul className="question-rows">{visible.map((item) => <li key={item.id}>
          <span className="row-icon"><FileText size={20} aria-hidden="true" /></span>
          <div className="row-text">
            <Link to={`/questions/${item.id}`}>{item.title}</Link>
            {item.body && <p>{item.body}</p>}
          </div>
          <div className="row-meta">
            <span className={'pill' + (item.user_id === user.id ? ' owned' : '')}>
              {item.user_id === user.id ? messages.questions.yours : messages.questions.shared}
            </span>
            <span>{item.last_edited_by ? messages.common.updated : messages.common.created}{' '}
              <DateValue value={item.last_edited_by ? item.updated_at : item.created_at} />
            </span>
          </div>
          <Link className="icon-button open-question" to={`/questions/${item.id}`} aria-label={formatMessage(messages.questions.openQuestion, { title: item.title })}>
            <ArrowUpRight size={19} aria-hidden="true" />
          </Link>
        </li>)}</ul>
      }}</Resource>
    </section>
  </>
}

function Back({ to = '/questions', children = messages.common.backToQuestions }) {
  return <Link className="back-link" to={to}><ArrowLeft size={16} aria-hidden="true" /> {children}</Link>
}

export function QuestionRoute({ mode }) {
  const { id } = useParams()
  if (mode === 'create') return <QuestionEditor />
  return <LoadedQuestion key={id} id={id} mode={mode} />
}

function LoadedQuestion({ id, mode }) {
  const { user } = useAuth()
  const loadQuestion = useCallback((signal) => questions.get(id, signal), [id])
  const state = useResource(loadQuestion)
  return <Resource state={state} label={messages.questions.detailResource}>{(question) => {
    const owned = user.id === question.user_id
    const editable = owned || user.role === 'admin'
    if (mode === 'edit') return editable ? <QuestionEditor question={question} owned={owned} />
      : <Navigate to={`/questions/${id}`} replace />
    return <article className="narrow">
      <Back />
      <PageHeading title={question.title} eyebrow={owned ? messages.questions.yourQuestion : messages.questions.sharedQuestion}
        action={editable && <Link className="button primary" to={`/questions/${id}/edit`}>{messages.questions.edit}</Link>} />
      <div className="panel padded">
        <p className="subtle">{messages.common.created} <DateValue value={question.created_at} />
          {question.last_edited_by && <> · {messages.common.updated} <DateValue value={question.updated_at} /></>}</p>
        <p className="prewrap question-body">{question.body || messages.questions.noDetails}</p>
      </div>
    </article>
  }}</Resource>
}

function QuestionEditor({ question, owned }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const accepted = state?.draft
  const [draft, setDraft] = useQuestionDraft(accepted ?? (question ? { title: question.title, body: question.body } : emptyQuestion))
  const [message, setMessage] = useState(accepted ? messages.questions.suggestionApplied : '')
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [working, setWorking] = useState('')
  const dialog = useRef(null)
  const removeButton = useRef(null)
  const flow = useImprovement(draft)
  const comparing = Boolean(flow.result?.suggestion)
  const busy = flow.busy || Boolean(working)
  const cancel = question ? `/questions/${question.id}` : '/questions'

  useEffect(() => {
    if (accepted) navigate('.', { replace: true, state: null })
  }, [accepted, navigate])

  function finish(message) {
    navigate('/questions', { replace: true, state: { message } })
  }

  async function save(event) {
    event.preventDefault()
    if (busy || comparing) return
    const form = event.currentTarget
    const errors = questionErrors(draft)
    flow.setErrors(errors)
    setError('')
    setMessage('')
    flow.reset()
    if (Object.keys(errors).length) {
      form.elements.namedItem(Object.keys(errors)[0])?.focus()
      return
    }
    setWorking('save')
    try {
      const input = cleanQuestion(draft)
      if (question) await questions.update(question.id, input)
      else await questions.create(input)
      finish(question ? messages.questions.updated : messages.questions.created)
    } catch (failure) {
      setError(failure.status === 413 ? messages.questions.tooLarge : failure.message)
      setWorking('')
    }
  }

  async function remove() {
    if (busy || !owned) return
    setDeleteError('')
    setWorking('delete')
    try {
      await questions.remove(question.id)
      finish(messages.questions.deleted)
    } catch (failure) {
      setDeleteError(failure.message)
      setWorking('')
    }
  }

  function resolveSuggestion(suggestion) {
    if (suggestion) setDraft(suggestion)
    flow.reset()
    setMessage(suggestion ? messages.questions.suggestionApplied : '')
    requestAnimationFrame(() => document.getElementById('question-title')?.focus())
  }

  return <div className="narrow">
    <Back to={cancel}>{question ? messages.questions.backToQuestion : messages.common.backToQuestions}</Back>
    <PageHeading title={question ? messages.questions.edit : messages.questions.newQuestion}
      description={question ? messages.questions.editDescription : messages.questions.createDescription} />
    <form className="panel padded form-stack" onSubmit={save} noValidate>
      {error ? <Notice kind="error">{error}</Notice> : message && <Notice kind="success">{message}</Notice>}
      <QuestionFields draft={draft} errors={flow.errors} disabled={busy || comparing}
        onChange={(value) => { setDraft(value); flow.reset() }} />
      <Improvement flow={flow} onAccept={resolveSuggestion} onKeep={() => resolveSuggestion()} />
      <div className="actions">
        <button className="button primary" disabled={busy || comparing}>
          {working === 'save' ? messages.questions.saving : messages.questions.save}
        </button>
        <ImproveButton busy={flow.busy} disabled={busy || comparing} onClick={() => {
          setError('')
          setMessage('')
          flow.improve()
        }} />
        <Link className="button secondary" to={cancel}>{messages.common.cancel}</Link>
      </div>
    </form>
    {owned && <div className="danger-zone">
      <button className="button danger" ref={removeButton} disabled={busy || comparing} onClick={() => {
        setDeleteError('')
        dialog.current.showModal()
      }}><Trash2 size={17} aria-hidden="true" /> {messages.questions.deleteAction}</button>
      <dialog ref={dialog} aria-labelledby="delete-title" onClose={() => removeButton.current?.focus()}
        onCancel={(event) => { if (working === 'delete') event.preventDefault() }}>
        <h2 id="delete-title">{messages.questions.confirmDelete}</h2>
        <p>{formatMessage(messages.questions.deleteDescription, { title: question.title })}</p>
        {deleteError && <Notice kind="error">{deleteError}</Notice>}
        <div className="actions">
          <button autoFocus className="button secondary" disabled={busy} onClick={() => dialog.current.close()}>{messages.common.cancel}</button>
          <button className="button danger solid" disabled={busy} onClick={remove}>
            {working === 'delete' ? messages.questions.deleting : messages.questions.deleteConfirmAction}
          </button>
        </div>
      </dialog>
    </div>}
  </div>
}
