import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useImprovement } from '../hooks/useImprovement'
import { useQuestionDraft } from '../hooks/useQuestionDraft'
import { Improvement, ImproveButton } from '../components/Improvement'
import { emptyQuestion, QuestionFields } from '../components/QuestionFields'
import { useChrome } from '../components/Layout'
import { Heading, Notice } from '../components/ui'
import messages from '../../../lang/message/en/messages.json'

// Standalone AI question improvement (CodeBridge addition). Accepted drafts continue to the Ask page.
export function AssistantPage() {
  const navigate = useNavigate()
  const { categories } = useChrome()
  const [draft, setDraft] = useQuestionDraft(emptyQuestion)
  const [accepted, setAccepted] = useState(false)
  const flow = useImprovement(draft)
  const locked = flow.busy || Boolean(flow.result?.suggestion)
  return <>
    <Heading>{messages.layout.assistant}</Heading>
    <div className="qa-part-form">
      <p>{messages.assistant.description}</p>
      <QuestionFields draft={draft} errors={flow.errors} disabled={locked} categories={categories}
        onChange={(next) => { setDraft(next); setAccepted(false); flow.reset() }}
        afterTitle={<>
          <ImproveButton busy={flow.busy} disabled={locked} onClick={flow.improve} />
          <Improvement flow={flow} onAccept={(revised) => { setDraft(revised); setAccepted(true); flow.reset() }}
            onKeep={flow.reset} />
        </>} />
      {accepted && <Notice kind="success">{messages.assistant.suggestionApplied}</Notice>}
      <div className="qa-form-tall-buttons">
        <button type="button" className="qa-form-tall-button qa-form-tall-button-ask" disabled={locked || !draft.title.trim()}
          onClick={() => navigate('/ask', { state: { draft } })}>{messages.assistant.continue}</button>
      </div>
    </div>
  </>
}
