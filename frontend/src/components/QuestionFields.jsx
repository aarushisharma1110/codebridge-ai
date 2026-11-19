import messages from '../../../lang/message/en/messages.json'
import { formatMessage } from '../formatMessage'
export const emptyQuestion = { title: '', body: '' }
export const MIN_TITLE_LENGTH = 12
export const MAX_TITLE_LENGTH = 120

export function cleanQuestion({ title, body }) {
  return { title: title.trim(), body: body.trim() }
}

export function questionErrors(draft) {
  const { title, body } = cleanQuestion(draft)
  const errors = {}
  if (title.length < MIN_TITLE_LENGTH || title.length > MAX_TITLE_LENGTH) {
    errors.title = title ? messages.questions.titleLength : messages.questions.titleRequired
  }
  if (body.length > 12000) errors.body = messages.questions.detailsLength
  return errors
}

export function QuestionFields({ draft, onChange, errors, disabled }) {
  return <fieldset className="form-stack" disabled={disabled}>
    <div className="field">
      <label htmlFor="question-title">{messages.questions.title}</label>
      <input id="question-title" name="title" required value={draft.title}
        placeholder={messages.questions.titlePlaceholder}
        aria-invalid={Boolean(errors.title)} aria-describedby="title-help"
        onChange={(event) => onChange({ ...draft, title: event.target.value })} />
      <span id="title-help" className={errors.title ? 'field-error' : 'hint'}>
        {errors.title || messages.questions.titleHint}
      </span>
    </div>
    <div className="field">
      <label htmlFor="question-body">{messages.questions.details} <span className="optional-label">{messages.questions.optional}</span></label>
      <textarea id="question-body" name="body" value={draft.body} rows={7}
        placeholder={messages.questions.detailsPlaceholder}
        aria-invalid={Boolean(errors.body)} aria-describedby="body-help"
        onChange={(event) => onChange({ ...draft, body: event.target.value })} />
      <span id="body-help" className={errors.body ? 'field-error' : 'hint'}>
        {errors.body || formatMessage(messages.questions.detailsHint, { count: draft.body.trim().length.toLocaleString() })}
      </span>
    </div>
  </fieldset>
}
