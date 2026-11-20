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

const NewQuestion = () => <Link className="button primary" to="/questions/new">
  <Plus size={18} aria-hidden="true" /> New Question
</Link>

export function QuestionsPage() {
  const { user } = useAuth()
  const { state } = useLocation()
  const load = useResource(questions.list)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all')

  return <>
    <PageHeading eyebrow="Workspace" title="My Questions"
      description="Create, improve, and manage your questions in one place." action={<NewQuestion />} />
    {state?.message && <Notice kind="success">{state.message}</Notice>}
    <div className="intro">
      <span className="feature-icon"><CircleHelp size={22} aria-hidden="true" /></span>
      <div><h2>Start with a clear question</h2>
        <p>Write a descriptive title, add context, and refine the wording with the AI Assistant.</p></div>
      <Link to="/assistant">Open AI Assistant <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>
    <section className="panel question-list" aria-labelledby="question-list-title">
      <div className="list-toolbar">
        <h2 id="question-list-title">Questions</h2>
        <div className="list-controls">
          <div className="scope" role="group" aria-label="Question ownership">
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All visible</button>
            <button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>Owned by me</button>
          </div>
          <label className="search-control">
            <Search size={17} aria-hidden="true" />
            <input type="search" aria-label="Search questions" placeholder="Search questions"
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>
      </div>
      <Resource state={load} label="questions">{(items) => {
        const query = search.trim().toLowerCase()
        const visible = items.filter((item) => (scope === 'all' || item.user_id === user.id) &&
          (item.title.toLowerCase().includes(query) || item.body.toLowerCase().includes(query)))
        if (!items.length) return <EmptyState icon={FileText} title="No questions yet">
          Select New Question to write your first question.
        </EmptyState>
        if (!visible.length) return <EmptyState icon={Search} title={query ? 'No matching questions' : 'No questions owned by you'}>
          {query ? 'Try another search term or ownership filter.' : 'Select New Question to create one.'}
        </EmptyState>
        return <ul className="question-rows">{visible.map((item) => <li key={item.id}>
          <span className="row-icon"><FileText size={20} aria-hidden="true" /></span>
          <div className="row-text">
            <Link to={`/questions/${item.id}`}>{item.title}</Link>
            {item.body && <p>{item.body}</p>}
          </div>
          <div className="row-meta">
            <span className={'pill' + (item.user_id === user.id ? ' owned' : '')}>
              {item.user_id === user.id ? 'Yours' : 'Shared'}
            </span>
            <span>{item.last_edited_by ? 'Updated ' : 'Created '}
              <DateValue value={item.last_edited_by ? item.updated_at : item.created_at} />
            </span>
          </div>
          <Link className="icon-button open-question" to={`/questions/${item.id}`} aria-label={`Open ${item.title}`}>
            <ArrowUpRight size={19} aria-hidden="true" />
          </Link>
        </li>)}</ul>
      }}</Resource>
    </section>
  </>
}

function Back({ to = '/questions', children = 'Back to questions' }) {
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
  return <Resource state={state} label="question">{(question) => {
    const owned = user.id === question.user_id
    const editable = owned || user.role === 'admin'
    if (mode === 'edit') return editable ? <QuestionEditor question={question} owned={owned} />
      : <Navigate to={`/questions/${id}`} replace />
    return <article className="narrow">
      <Back />
      <PageHeading title={question.title} eyebrow={owned ? 'Your question' : 'Shared question'}
        action={editable && <Link className="button primary" to={`/questions/${id}/edit`}>Edit question</Link>} />
      <div className="panel padded">
        <p className="subtle">Created <DateValue value={question.created_at} />
          {question.last_edited_by && <> · Updated <DateValue value={question.updated_at} /></>}</p>
        <p className="prewrap question-body">{question.body || 'No additional details.'}</p>
      </div>
    </article>
  }}</Resource>
}

function QuestionEditor({ question, owned }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const accepted = state?.draft
  const [draft, setDraft] = useQuestionDraft(accepted ?? (question ? { title: question.title, body: question.body } : emptyQuestion))
  const [message, setMessage] = useState(accepted ? 'Suggestion applied. Review it before saving.' : '')
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
      finish(question ? 'Question updated.' : 'Question created.')
    } catch (failure) {
      setError(failure.status === 413 ? 'The encoded question exceeds the server request limit. Shorten the details and try again.' : failure.message)
      setWorking('')
    }
  }

  async function remove() {
    if (busy || !owned) return
    setDeleteError('')
    setWorking('delete')
    try {
      await questions.remove(question.id)
      finish('Question deleted.')
    } catch (failure) {
      setDeleteError(failure.message)
      setWorking('')
    }
  }

  function resolveSuggestion(suggestion) {
    if (suggestion) setDraft(suggestion)
    flow.reset()
    setMessage(suggestion ? 'Suggestion applied. Review it before saving.' : '')
    requestAnimationFrame(() => document.getElementById('question-title')?.focus())
  }

  return <div className="narrow">
    <Back to={cancel}>{question ? 'Back to question' : 'Back to questions'}</Back>
    <PageHeading title={question ? 'Edit question' : 'New Question'}
      description={question ? 'Revise the wording or add context to your question.' : 'Give your question a clear title and add any context readers will need.'} />
    <form className="panel padded form-stack" onSubmit={save} noValidate>
      {error ? <Notice kind="error">{error}</Notice> : message && <Notice kind="success">{message}</Notice>}
      <QuestionFields draft={draft} errors={flow.errors} disabled={busy || comparing}
        onChange={(value) => { setDraft(value); flow.reset() }} />
      <Improvement flow={flow} onAccept={resolveSuggestion} onKeep={() => resolveSuggestion()} />
      <div className="actions">
        <button className="button primary" disabled={busy || comparing}>
          {working === 'save' ? 'Saving…' : 'Save Question'}
        </button>
        <ImproveButton busy={flow.busy} disabled={busy || comparing} onClick={() => {
          setError('')
          setMessage('')
          flow.improve()
        }} />
        <Link className="button secondary" to={cancel}>Cancel</Link>
      </div>
    </form>
    {owned && <div className="danger-zone">
      <button className="button danger" ref={removeButton} disabled={busy || comparing} onClick={() => {
        setDeleteError('')
        dialog.current.showModal()
      }}><Trash2 size={17} aria-hidden="true" /> Delete Question</button>
      <dialog ref={dialog} aria-labelledby="delete-title" onClose={() => removeButton.current?.focus()}
        onCancel={(event) => { if (working === 'delete') event.preventDefault() }}>
        <h2 id="delete-title">Delete this question?</h2>
        <p>This permanently removes “{question.title}”.</p>
        {deleteError && <Notice kind="error">{deleteError}</Notice>}
        <div className="actions">
          <button autoFocus className="button secondary" disabled={busy} onClick={() => dialog.current.close()}>Cancel</button>
          <button className="button danger solid" disabled={busy} onClick={remove}>
            {working === 'delete' ? 'Deleting…' : 'Delete question'}
          </button>
        </div>
      </dialog>
    </div>}
  </div>
}
