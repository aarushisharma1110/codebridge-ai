import { useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Image, Italic, Link, List, ListOrdered, Minus, Quote, Redo2,
  RemoveFormatting, Strikethrough, Subscript, Superscript, Table, Underline, Undo2, Unlink
} from 'lucide-react'
import messages from '../../../lang/message/en/messages.json'

const e = messages.q2a.editor

// Same allowlist as backend/lib/html.js. The server sanitizes before storing; this protects rendering too.
const PURIFY = {
  ALLOWED_TAGS: ['p', 'br', 'h2', 'h3', 'h4', 'pre', 'code', 'blockquote', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
    'sub', 'sup', 'span', 'font', 'ul', 'ol', 'li', 'a', 'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'width', 'height', 'color', 'colspan', 'rowspan', 'style', 'rel', 'target'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
}
export const sanitize = (html) => DOMPurify.sanitize(html, PURIFY)

const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

// Converts a plain-text (format '') body to editor HTML, one paragraph per blank-line block.
export function textToHtml(text) {
  if (!text) return ''
  return text.split(/\n{2,}/).map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('')
}

export function htmlToText(html) {
  const element = document.createElement('div')
  element.innerHTML = sanitize(html || '')
  return (element.textContent || '').replace(/ /g, ' ').trim()
}

const COLORS = ['#000000', '#7f8c8d', '#e74c3c', '#e67e22', '#f1c40f', '#27ae60', '#3498db', '#9b59b6']
const CHARACTERS = ['©', '®', '™', '°', '±', '×', '÷', '€', '£', '¥', '§', '¶', '…', '—', '→', '≤', '≥', '≠', 'Ω', 'π']

// A CKEditor-style toolbar over a contentEditable area, like Q2A's default WYSIWYG editor.
export function RichEditor({ id, value, onChange, labelledBy, describedBy, invalid, disabled, rows = 10 }) {
  const area = useRef(null)

  useEffect(() => {
    if (area.current && area.current.innerHTML !== value) area.current.innerHTML = value || ''
  }, [value])

  const emit = () => onChange(area.current.innerHTML)
  function run(command, argument) {
    if (disabled) return
    area.current.focus()
    if (typeof document.execCommand === 'function') {
      document.execCommand('styleWithCSS', false, ['foreColor', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command))
      document.execCommand(command, false, argument)
    }
    emit()
  }
  const button = (label, Icon, command, argument) => <button type="button" className="qa-editor-button" title={label}
    aria-label={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => run(command, argument)}>
    <Icon size={15} aria-hidden="true" />
  </button>
  const ask = (label, command, build) => {
    const answer = window.prompt(label, 'https://')
    if (answer && /^https?:\/\/\S+$/i.test(answer.trim())) run(command, build ? build(answer.trim()) : answer.trim())
  }

  return <div className={'qa-editor' + (invalid ? ' qa-editor-invalid' : '') + (disabled ? ' qa-editor-disabled' : '')}>
    <div className="qa-editor-toolbar" role="toolbar" aria-label={e.toolbar} aria-controls={id}>
      <span className="qa-editor-group">
        <select className="qa-editor-select" aria-label={e.format} disabled={disabled} value=""
          onChange={(event) => { if (event.target.value) run('formatBlock', event.target.value) }}>
          <option value="">{e.format}</option>
          <option value="<p>">{e.normal}</option>
          <option value="<h2>">{e.heading2}</option>
          <option value="<h3>">{e.heading3}</option>
          <option value="<pre>">{e.formatted}</option>
        </select>
      </span>
      <span className="qa-editor-group">
        {button(e.numbered, ListOrdered, 'insertOrderedList')}
        {button(e.bulleted, List, 'insertUnorderedList')}
        {button(e.quote, Quote, 'formatBlock', '<blockquote>')}
      </span>
      <span className="qa-editor-group">
        {button(e.alignLeft, AlignLeft, 'justifyLeft')}
        {button(e.alignCenter, AlignCenter, 'justifyCenter')}
        {button(e.alignRight, AlignRight, 'justifyRight')}
        {button(e.justify, AlignJustify, 'justifyFull')}
      </span>
      <span className="qa-editor-break" />
      <span className="qa-editor-group">
        {button(e.bold, Bold, 'bold')}
        {button(e.italic, Italic, 'italic')}
        {button(e.underline, Underline, 'underline')}
        {button(e.strike, Strikethrough, 'strikeThrough')}
        {button(e.subscript, Subscript, 'subscript')}
        {button(e.superscript, Superscript, 'superscript')}
      </span>
      <span className="qa-editor-group">
        <select className="qa-editor-select qa-editor-color" aria-label={e.textColor} disabled={disabled} value=""
          onChange={(event) => { if (event.target.value) run('foreColor', event.target.value) }}>
          <option value="">A</option>
          {COLORS.map((color) => <option key={color} value={color} style={{ color }}>■ {color}</option>)}
        </select>
      </span>
      <span className="qa-editor-group">
        <button type="button" className="qa-editor-button" title={e.link} aria-label={e.link} disabled={disabled}
          onMouseDown={(event) => event.preventDefault()} onClick={() => ask(e.linkPrompt, 'createLink')}><Link size={15} aria-hidden="true" /></button>
        {button(e.unlink, Unlink, 'unlink')}
      </span>
      <span className="qa-editor-group">
        <button type="button" className="qa-editor-button" title={e.image} aria-label={e.image} disabled={disabled}
          onMouseDown={(event) => event.preventDefault()} onClick={() => ask(e.imagePrompt, 'insertImage')}><Image size={15} aria-hidden="true" /></button>
        {button(e.table, Table, 'insertHTML', '<table><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>')}
        {button(e.horizontalLine, Minus, 'insertHorizontalRule')}
        <select className="qa-editor-select qa-editor-chars" aria-label={e.specialCharacter} disabled={disabled} value=""
          onChange={(event) => { if (event.target.value) run('insertText', event.target.value) }}>
          <option value="">Ω</option>
          {CHARACTERS.map((character) => <option key={character} value={character}>{character}</option>)}
        </select>
      </span>
      <span className="qa-editor-group">
        {button(e.undo, Undo2, 'undo')}
        {button(e.redo, Redo2, 'redo')}
      </span>
      <span className="qa-editor-group">
        {button(e.removeFormat, RemoveFormatting, 'removeFormat')}
      </span>
    </div>
    <div id={id} ref={area} className="qa-editor-area qa-post-content" contentEditable={!disabled} role="textbox"
      aria-multiline="true" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined}
      style={{ minHeight: `${rows * 1.5}em` }} suppressContentEditableWarning onInput={emit} onBlur={emit} />
  </div>
}
