import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useResource } from '../hooks/useResource'
import { useImprovement } from '../hooks/useImprovement'
import { useQuestionDraft } from '../hooks/useQuestionDraft'
import { questions } from '../services/api'
import { Improvement, ImproveButton } from '../components/Improvement'
import { emptyQuestion, QuestionFields } from '../components/QuestionFields'
import { Notice, PageHeading, Resource } from '../components/ui'
import messages from '../../../lang/message/en/messages.json'

export function AssistantPage() {
  const { user } = useAuth()
  const available = useResource(questions.list)
  const [{ draft, selection, accepted }, setWorkspace] = useQuestionDraft({
    draft: emptyQuestion, selection: '', accepted: false,
  })
  const flow = useImprovement(draft)
  const disabled = flow.busy || Boolean(flow.result?.suggestion)
  const source = available.data?.find((item) => String(item.id) === selection)
  const canEdit = source && (source.user_id === user.id || user.role === 'admin')
  const editor = canEdit ? `/questions/${source.id}/edit` : '/questions/new'

  function change(next) {
    setWorkspace((current) => ({ ...current, ...next }))
    flow.reset()
  }

  return <div className="narrow">
    <PageHeading title={messages.layout.assistant} description={messages.assistant.description} />
    <div className="panel padded form-stack">
      <div className="assistant-intro">
        <span className="feature-icon teal"><Sparkles size={22} aria-hidden="true" /></span>
        <h2>{messages.assistant.refine}</h2>
      </div>
      <Resource state={available} label={messages.assistant.existingResource}>{(items) => items.length > 0 &&
        <label className="field" htmlFor="select-question">{messages.assistant.startFromExisting}
          <select id="select-question" value={selection} disabled={disabled} onChange={(event) => {
            const id = event.target.value
            const question = items.find((item) => String(item.id) === id)
            flow.setErrors({})
            change({
              selection: id,
              accepted: false,
              draft: question ? { title: question.title, body: question.body } : emptyQuestion,
            })
          }}>
            <option value="">{messages.assistant.writeNew}</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      }</Resource>
      <QuestionFields draft={draft} errors={flow.errors} disabled={disabled} onChange={(value) => change({ draft: value })} />
      <Improvement flow={flow} onAccept={(suggestion) => {
        change({ draft: suggestion, accepted: true })
        requestAnimationFrame(() => document.getElementById('continue-to-editor')?.focus())
      }} onKeep={() => {
        flow.reset()
        requestAnimationFrame(() => document.getElementById('question-title')?.focus())
      }} />
      {accepted && !disabled && !flow.result && <Notice kind="success">{messages.assistant.suggestionApplied}</Notice>}
      <div className="actions">
        <ImproveButton busy={flow.busy} disabled={disabled} onClick={flow.improve} />
        {accepted && !disabled && <Link className="button primary" id="continue-to-editor" to={editor} state={{ draft }}>
          {messages.assistant.continue} <ArrowRight size={17} aria-hidden="true" />
        </Link>}
      </div>
    </div>
  </div>
}
