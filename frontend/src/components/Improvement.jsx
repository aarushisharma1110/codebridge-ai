import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { Notice } from './ui'

export function ImproveButton({ busy, disabled, onClick }) {
  return <button className="button ai" type="button" disabled={busy || disabled} onClick={onClick}>
    {busy ? <span className="spinner" aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
    {busy ? 'Improving…' : 'Improve with AI'}
  </button>
}

export function Improvement({ flow, onAccept, onKeep }) {
  const heading = useRef(null)
  const { result, busy } = flow

  useEffect(() => {
    if (result?.suggestion) heading.current?.focus()
  }, [result])

  if (busy) return <p className="loading" role="status">Preparing a wording suggestion…</p>
  if (!result) return null
  if (result.unavailable) return <Notice>AI improvement is unavailable. You can continue editing your question.</Notice>
  if (result.error) return <Notice kind="error">
    <div>{result.error}</div>
    <button type="button" className="button secondary small" onClick={flow.improve}>Try again</button>
  </Notice>

  return <section className="comparison" aria-labelledby="comparison-title">
    <h2 id="comparison-title" ref={heading} tabIndex={-1}>Review the suggestion</h2>
    <div className="comparison-grid">
      {[[result.original, 'Original'], [result.suggestion, 'Suggested']].map(([version, label]) =>
        <div className="version" key={label}>
          <h3>{label}</h3>
          <strong>{version.title}</strong>
          {version.body && <p className="prewrap">{version.body}</p>}
        </div>)}
    </div>
    <div className="actions">
      <button type="button" className="button primary" onClick={() => onAccept(result.suggestion)}>Accept suggestion</button>
      <button type="button" className="button secondary" onClick={onKeep}>Keep original</button>
    </div>
  </section>
}
