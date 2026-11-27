import messages from '../../../lang/message/en/messages.json'
import { htmlToText, RichEditor } from './RichEditor'
export const emptyQuestion = { title: '', body: '', tags: '', category_id: '' }
export const MIN_TITLE_LENGTH = 12
export const MAX_TITLE_LENGTH = 120
const TAG_PATTERN = /^[a-z0-9][a-z0-9+#._-]{0,39}$/
const m = messages.q2a

export const splitTags = (text) => [...new Set(text.toLowerCase().split(/[\s,]+/).filter(Boolean))]

// The body comes from the rich text editor and is sent as HTML (Q2A format "html").
export function cleanQuestion({ title, body, tags = '', category_id = '' }) {
  const html = htmlToText(body) || /<img/i.test(body) ? body.trim() : ''
  return {
    title: title.trim(), body: html, format: 'html', tags: splitTags(tags),
    category_id: category_id === '' ? null : Number(category_id)
  }
}

export function questionErrors(draft) {
  const { title, body, tags } = cleanQuestion(draft)
  const errors = {}
  if (title.length < MIN_TITLE_LENGTH || title.length > MAX_TITLE_LENGTH) {
    errors.title = title ? messages.questions.titleLength : messages.questions.titleRequired
  }
  if (body.length > 12000) errors.body = messages.questions.detailsLength
  if (tags.length > 5 || tags.some((tag) => !TAG_PATTERN.test(tag))) errors.tags = m.ask.tagsError
  return errors
}

function Field({ id, label, note, error, children }) {
  return <tr><td className="qa-form-tall-label-cell">
    <label className="qa-form-tall-label" htmlFor={id}>{label}</label>
    <div className="qa-form-tall-data">
      {children}
      {error ? <span className="qa-form-tall-error" id={`${id}-help`}>{error}</span>
        : note && <span className="qa-form-tall-note" id={`${id}-help`}>{note}</span>}
    </div>
  </td></tr>
}

// The Q2A ask form fields: title, category, content and tags.
export function QuestionFields({ draft, onChange, errors, disabled, categories = [], afterTitle }) {
  const set = (name) => (event) => onChange({ ...draft, [name]: event.target.value })
  const top = categories.filter((category) => !category.parent_id)
  const selectedCategory = categories.find((category) => String(category.id) === String(draft.category_id))
  const group = (rows) => <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    <table className="qa-form-tall-table"><tbody>{rows}</tbody></table>
  </fieldset>
  // The AI panel stays outside the disabled fieldsets so its Accept and Keep buttons remain usable.
  return <>
    {group(<Field id="question-title" label={m.ask.titleLabel} note={m.ask.titleHelp} error={errors.title}>
      <input id="question-title" name="title" className="qa-form-tall-text" required value={draft.title}
        aria-invalid={Boolean(errors.title)} aria-describedby="question-title-help" maxLength={400}
        onChange={set('title')} />
    </Field>)}
    {afterTitle}
    {group(<>
      {categories.length > 0 && <tr><td className="qa-form-tall-inline">
        <label className="qa-form-tall-label" htmlFor="question-category">{m.ask.categoryLabel}</label>{' '}
        <select id="question-category" value={draft.category_id ?? ''} onChange={set('category_id')}>
          <option value="">{m.ask.noCategory}</option>
          {top.map((category) => [
            <option key={category.id} value={category.id}>{category.title}</option>,
            ...categories.filter((child) => child.parent_id === category.id).map((child) =>
              <option key={child.id} value={child.id}>{'  ' + category.title + ' / ' + child.title}</option>)
          ])}
        </select>
        {selectedCategory?.description && <span className="qa-form-tall-note qa-category-note">{selectedCategory.description}</span>}
      </td></tr>}
      <tr><td>
        <span className="qa-form-tall-label" id="question-body-label">{m.ask.contentLabel}</span>
        <div className="qa-form-tall-data">
          <RichEditor id="question-body" value={draft.body} labelledBy="question-body-label" describedBy="question-body-help"
            invalid={Boolean(errors.body)} disabled={disabled} onChange={(body) => onChange({ ...draft, body })} />
          {errors.body ? <span className="qa-form-tall-error" id="question-body-help">{errors.body}</span>
            : <span className="qa-form-tall-note" id="question-body-help">{m.ask.contentHelp}</span>}
        </div>
      </td></tr>
      <Field id="question-tags" label={m.ask.tagsLabel} note={m.ask.tagsHelp} error={errors.tags}>
        <input id="question-tags" name="tags" className="qa-form-tall-text" value={draft.tags}
          aria-invalid={Boolean(errors.tags)} aria-describedby="question-tags-help" autoComplete="off"
          onChange={set('tags')} />
      </Field>
    </>)}
  </>
}
