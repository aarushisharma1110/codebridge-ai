import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { Notice } from './ui'
import messages from '../../../lang/message/en/messages.json'

// CodeBridge addition to the Q2A ask and edit forms: AI wording suggestions.
export function ImproveButton({ busy, disabled, onClick }) {
  return <button className="qa-form-tall-button qa-form-tall-button-ai" type="button" disabled={busy || disabled} onClick={onClick}>
    <Sparkles size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
    {busy ? messages.improvement.improving : messages.improvement.improve}
  </button>
}

export function Improvement({ flow, onAccept, onKeep }) {
  const heading = useRef(null)
  const { result, busy } = flow

  useEffect(() => {
    if (result?.suggestion) heading.current?.focus()
  }, [result])

  if (busy) return <div className="qa-ai-panel"><p className="qa-ai-status" role="status">{messages.improvement.preparing}</p></div>
  if (!result) return null
  if (result.error) return <Notice kind="error">
    {result.error}
    <button type="button" className="qa-retry" onClick={flow.improve}>{messages.common.retry}</button>
  </Notice>

  return <section className="qa-ai-panel" aria-labelledby="comparison-title">
    <h2 id="comparison-title" ref={heading} tabIndex={-1}>{messages.improvement.review}</h2>
    <div className="qa-ai-compare">
      {[[result.original, messages.improvement.original], [result.suggestion, messages.improvement.suggested]].map(([version, label]) =>
        <div className="qa-ai-version" key={label}>
          <h3>{label}</h3>
          <p className="prewrap" style={{ margin: 0 }}>{version}</p>
        </div>)}
    </div>
    {!result.fitsTitle && <p className="qa-form-tall-note">{messages.improvement.addedToDetails}</p>}
    <div>
      <button type="button" className="qa-form-tall-button qa-form-tall-button-save" onClick={() => onAccept(result.revisedDraft)}>{messages.improvement.accept}</button>
      <button type="button" className="qa-form-tall-button qa-form-tall-button-cancel" onClick={onKeep}>{messages.improvement.keep}</button>
    </div>
  </section>
}
