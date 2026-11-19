import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { Notice } from './ui'
import messages from '../../../lang/message/en/messages.json'

export function ImproveButton({ busy, disabled, onClick }) {
  return <button className="button ai" type="button" disabled={busy || disabled} onClick={onClick}>
    {busy ? <span className="spinner" aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
    {busy ? messages.improvement.improving : messages.improvement.improve}
  </button>
}

export function Improvement({ flow, onAccept, onKeep }) {
  const heading = useRef(null)
  const { result, busy } = flow

  useEffect(() => {
    if (result?.suggestion) heading.current?.focus()
  }, [result])

  if (busy) return <p className="loading" role="status">{messages.improvement.preparing}</p>
  if (!result) return null
  if (result.error) return <Notice kind="error">
    <div>{result.error}</div>
    <button type="button" className="button secondary small" onClick={flow.improve}>{messages.common.retry}</button>
  </Notice>

  return <section className="comparison" aria-labelledby="comparison-title">
    <h2 id="comparison-title" ref={heading} tabIndex={-1}>{messages.improvement.review}</h2>
    <div className="comparison-grid">
      {[[result.original, messages.improvement.original], [result.suggestion, messages.improvement.suggested]].map(([version, label]) =>
        <div className="version" key={label}>
          <h3>{label}</h3>
          <p className="prewrap">{version}</p>
        </div>)}
    </div>
    {!result.fitsTitle && <p className="hint">{messages.improvement.addedToDetails}</p>}
    <div className="actions">
      <button type="button" className="button primary" onClick={() => onAccept(result.revisedDraft)}>{messages.improvement.accept}</button>
      <button type="button" className="button secondary" onClick={onKeep}>{messages.improvement.keep}</button>
    </div>
  </section>
}
