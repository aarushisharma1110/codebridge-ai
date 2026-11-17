export const emptyQuestion = { title: '', body: '' }

export function cleanQuestion({ title, body }) {
  return { title: title.trim(), body: body.trim() }
}

export function questionErrors(draft) {
  const { title, body } = cleanQuestion(draft)
  const errors = {}
  if (title.length < 12 || title.length > 120) {
    errors.title = title ? 'Use 12–120 characters for the title.' : 'Enter a question title.'
  }
  if (body.length > 12000) errors.body = 'Use at most 12,000 characters for the details.'
  return errors
}

export function QuestionFields({ draft, onChange, errors, disabled }) {
  return <fieldset className="form-stack" disabled={disabled}>
    <div className="field">
      <label htmlFor="question-title">Question title</label>
      <input id="question-title" name="title" required value={draft.title}
        placeholder="What would you like to ask?"
        aria-invalid={Boolean(errors.title)} aria-describedby="title-help"
        onChange={(event) => onChange({ ...draft, title: event.target.value })} />
      <span id="title-help" className={errors.title ? 'field-error' : 'hint'}>
        {errors.title || '12–120 characters'}
      </span>
    </div>
    <div className="field">
      <label htmlFor="question-body">Question details <span className="optional-label">Optional</span></label>
      <textarea id="question-body" name="body" value={draft.body} rows={7}
        placeholder="Add context, examples, or what you’ve already tried."
        aria-invalid={Boolean(errors.body)} aria-describedby="body-help"
        onChange={(event) => onChange({ ...draft, body: event.target.value })} />
      <span id="body-help" className={errors.body ? 'field-error' : 'hint'}>
        {errors.body || `${draft.body.trim().length.toLocaleString()} / 12,000 characters`}
      </span>
    </div>
  </fieldset>
}
