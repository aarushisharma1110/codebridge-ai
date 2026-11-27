import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { questions } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useImprovement } from '../hooks/useImprovement'
import { useQuestionDraft } from '../hooks/useQuestionDraft'
import { useChrome } from '../components/Layout'
import { Improvement, ImproveButton } from '../components/Improvement'
import { cleanQuestion, emptyQuestion, QuestionFields, questionErrors } from '../components/QuestionFields'
import { Heading, Notice, questionUrl } from '../components/ui'
import messages from '../../../lang/message/en/messages.json'

const m = messages.q2a

// "Before proceeding, please check your question was not asked already" (Q2A ask page).
function SimilarQuestions({ title }) {
  const [similar, setSimilar] = useState([])
  useEffect(() => {
    const text = title.trim()
    if (text.length < 12) { setSimilar([]); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      questions.list({ q: text.split(/\s+/).filter((word) => word.length > 3).slice(0, 6).join(' ') || text }, controller.signal)
        .then((data) => setSimilar(data.questions.slice(0, 5))).catch(() => {})
    }, 600)
    return () => { clearTimeout(timer); controller.abort() }
  }, [title])
  if (!similar.length) return null
  return <div className="qa-ask-similar">
    <div className="qa-ask-similar-title">{m.ask.similarTitle}</div>
    <ul className="qa-q-title-list">
      {similar.map((question) => <li className="qa-q-title-item" key={question.id}>
        <Link to={questionUrl(question)} target="_blank" rel="noopener">{question.title}</Link>
      </li>)}
    </ul>
  </div>
}

export function AskPage() {
  const { user } = useAuth()
  const { categories, refreshCategories } = useChrome()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [draft, setDraft] = useQuestionDraft(state?.draft ? { ...emptyQuestion, ...state.draft } : emptyQuestion)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const flow = useImprovement(draft)
  const locked = busy || flow.busy || Boolean(flow.result?.suggestion)

  async function submit(event) {
    event.preventDefault()
    const found = questionErrors(draft)
    setErrors(found)
    setFailure('')
    if (Object.keys(found).length) {
      document.getElementById(found.title ? 'question-title' : found.body ? 'question-body' : 'question-tags')?.focus()
      return
    }
    setBusy(true)
    try {
      const question = await questions.create(cleanQuestion(draft))
      refreshCategories()
      navigate(questionUrl(question))
    } catch (error) {
      setFailure(error.status === 413 ? messages.questions.tooLarge : error.message)
      setBusy(false)
    }
  }

  return <>
    <Heading>{m.headings.ask}</Heading>
    {user.blocked && <Notice kind="error">{messages.q2a.vote.disabled}</Notice>}
    <form className="qa-part-form qa-part-form-q-new" onSubmit={submit} noValidate>
      <QuestionFields draft={draft} errors={{ ...flow.errors, ...errors }} disabled={locked} categories={categories}
        onChange={(next) => { setDraft(next); flow.reset() }}
        afterTitle={<>
          <ImproveButton busy={flow.busy} disabled={locked} onClick={flow.improve} />
          <Improvement flow={flow} onAccept={(revised) => {
            setDraft(revised)
            flow.reset()
            requestAnimationFrame(() => document.getElementById('question-title')?.focus())
          }} onKeep={() => { flow.reset(); requestAnimationFrame(() => document.getElementById('question-title')?.focus()) }} />
          <SimilarQuestions title={draft.title} />
        </>} />
      {failure && <Notice kind="error">{failure}</Notice>}
      <div className="qa-form-tall-buttons">
        <button className="qa-form-tall-button qa-form-tall-button-ask" disabled={locked || user.blocked}>
          {busy ? m.ask.submitting : m.ask.submit}</button>
      </div>
    </form>
  </>
}
