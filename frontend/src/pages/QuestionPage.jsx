import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  Check, EyeOff, Eye, Flag, FlagOff, Lock, LockOpen, MessageSquare, Pencil, Reply, Star, Trash2, Eraser
} from 'lucide-react'
import { answers as answerApi, atLeast, comments as commentApi, questions } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLoad } from '../hooks/useResource'
import { useImprovement } from '../hooks/useImprovement'
import { useChrome } from '../components/Layout'
import { AnswerCount, PostMeta, TagList, VoteBox, voteBlockReason } from '../components/q2a'
import { Improvement, ImproveButton } from '../components/Improvement'
import { cleanQuestion, QuestionFields, questionErrors } from '../components/QuestionFields'
import { fmt, Heading, Loading, Notice, PostContent, questionUrl, slugify } from '../components/ui'
import { htmlToText, RichEditor, textToHtml } from '../components/RichEditor'
import messages from '../../../lang/message/en/messages.json'

const m = messages.q2a

// A Q2A "light" button: an icon square, or an icon with text for answer/comment.
function LightButton({ kind, icon: Icon, label, title, wide = false, onClick, disabled, active }) {
  return <button type="button" className={`qa-form-light-button qa-form-light-button-${kind}` +
    (wide ? ' qa-form-light-button-wide' : '') + (active ? ' qa-form-light-button-active' : '')}
  title={title || label} aria-label={wide ? undefined : (title || label)} onClick={onClick} disabled={disabled}>
    <Icon size={wide ? 15 : 16} aria-hidden="true" />{wide && <span>{label}</span>}
  </button>
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      return await fn()
    } catch (failure) {
      setError(failure.message)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, clear: () => setError('') }
}

// Answers use the rich text editor (HTML); comments use a plain textarea, as in a default Q2A install.
function TextForm({ id, label, initial = '', submitLabel, onSubmit, onCancel, min = 12, lengthError, autoFocus = true, rich = false }) {
  const [text, setText] = useState(initial)
  const [error, setError] = useState('')
  const action = useAction()
  async function submit(event) {
    event.preventDefault()
    const value = text.trim()
    const visible = rich ? htmlToText(value) : value
    if (visible.length < min || value.length > 12000) { setError(lengthError); return }
    setError('')
    const done = await action.run(() => onSubmit(value))
    if (done !== undefined) setText('')
  }
  return <form onSubmit={submit} className="qa-text-form">
    {rich ? <>
      <span className="qa-form-tall-label" id={`${id}-label`}>{label}</span>
      <RichEditor id={id} value={text} labelledBy={`${id}-label`} invalid={Boolean(error)} rows={8} onChange={setText} />
    </> : <>
      <label className="qa-form-tall-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="qa-form-tall-text" rows={5} value={text} autoFocus={autoFocus}
        aria-invalid={Boolean(error)} onChange={(event) => setText(event.target.value)} />
    </>}
    {(error || action.error) && <span className="qa-form-tall-error" role="alert">{error || action.error}</span>}
    <div className="qa-form-tall-buttons">
      <button className="qa-form-tall-button qa-form-tall-button-answer" disabled={action.busy}>{submitLabel}</button>
      {onCancel && <button type="button" className="qa-form-tall-button qa-form-tall-button-cancel" onClick={onCancel}>{m.question.cancel}</button>}
    </div>
  </form>
}

function CommentItem({ comment, ctx }) {
  const { user, update, remove, openComment } = ctx
  const [editing, setEditing] = useState(false)
  const action = useAction()
  const own = comment.user_id === user.id
  const editor = atLeast(user, 'editor')
  const call = (fn) => action.run(async () => update('comment', await fn()))
  return <div className={'qa-c-list-item' + (comment.hidden ? ' qa-c-item-hidden' : '')} id={`c${comment.id}`}>
    <div className="qa-c-item-avatar-meta">
      <span className="qa-c-item-meta">
        <PostMeta what={m.meta.commented} when={comment.created_at} handle={comment.author_handle} points={comment.author_points}
          extra={<>{comment.hidden && <> · <strong>{m.meta.hidden}</strong></>}
            {editor && comment.flag_count > 0 && <span className="qa-q-item-flags">
              {comment.flag_count === 1 ? m.meta.flag : fmt(m.meta.flags, { count: comment.flag_count })}</span>}</>} />
      </span>
    </div>
    {editing ? <TextForm id={`c${comment.id}-edit`} label={m.comment.edit} initial={comment.body} submitLabel={m.question.save}
      lengthError={m.comment.lengthError} onCancel={() => setEditing(false)}
      onSubmit={async (body) => { update('comment', await commentApi.update(comment.id, body)); setEditing(false); return true }} />
      : <PostContent text={comment.body} format={comment.format} className="qa-c-item-content" />}
    {action.error && <Notice kind="error">{action.error}</Notice>}
    {!editing && <div className="qa-c-item-buttons">
      {!comment.hidden && ctx.canRespond && <button type="button" className="qa-form-light-button" onClick={openComment}
        title={m.comment.reply}><Reply size={12} aria-hidden="true" /> {m.comment.reply}</button>}
      {!comment.hidden && (own || editor) && !user.blocked && <button type="button" className="qa-form-light-button"
        onClick={() => setEditing(true)}><Pencil size={12} aria-hidden="true" /> {m.comment.edit}</button>}
      {!comment.hidden && !own && !user.blocked && <button type="button" className="qa-form-light-button" disabled={action.busy}
        onClick={() => call(() => commentApi.flag(comment.id, !comment.my_flag))}>
        <Flag size={12} aria-hidden="true" /> {comment.my_flag ? m.comment.unflag : m.comment.flag}</button>}
      {!comment.hidden && (own || editor) && <button type="button" className="qa-form-light-button" disabled={action.busy}
        onClick={() => call(() => commentApi.hide(comment.id))}><EyeOff size={12} aria-hidden="true" /> {m.comment.hide}</button>}
      {comment.hidden && editor && <button type="button" className="qa-form-light-button" disabled={action.busy}
        onClick={() => call(() => commentApi.reshow(comment.id))}><Eye size={12} aria-hidden="true" /> {m.comment.reshow}</button>}
      {comment.hidden && atLeast(user, 'moderator') && <button type="button" className="qa-form-light-button" disabled={action.busy}
        onClick={() => window.confirm(m.comment.confirmDelete) && action.run(async () => {
          await commentApi.remove(comment.id); remove('comment', comment.id)
        })}><Trash2 size={12} aria-hidden="true" /> {m.comment.delete}</button>}
    </div>}
  </div>
}

function Comments({ list, ctx, open, setOpen, parent }) {
  return <div className="qa-c-list">
    {list.map((comment) => <CommentItem key={comment.id} comment={comment} ctx={{ ...ctx, openComment: () => setOpen(true) }} />)}
    {open && <div className="qa-c-form">
      <TextForm id={`${parent.kind}${parent.id}-comment`} label={parent.kind === 'q' ? m.question.yourComment : m.question.yourAnswerComment}
        submitLabel={m.question.addComment} lengthError={m.comment.lengthError} onCancel={() => setOpen(false)}
        onSubmit={async (body) => {
          const comment = parent.kind === 'q' ? await questions.comment(parent.id, body) : await answerApi.comment(parent.id, body)
          ctx.add('comment', comment)
          setOpen(false)
          return true
        }} />
    </div>}
  </div>
}

function AnswerItem({ answer, question, ctx }) {
  const { user, update, remove, setAnswers } = ctx
  const [editing, setEditing] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const action = useAction()
  const own = answer.user_id === user.id
  const editor = atLeast(user, 'editor')
  const canSelect = (question.user_id === user.id || editor) && !question.hidden && !answer.hidden && !user.blocked
  const call = (fn) => action.run(async () => update('answer', await fn()))
  return <div className={'qa-a-list-item' + (answer.selected ? ' qa-a-list-item-selected' : '') +
    (answer.hidden ? ' qa-a-list-item-hidden' : '')} id={`a${answer.id}`}>
    <div className="qa-a-item-stats">
      <VoteBox post={answer} disabledReason={voteBlockReason(user, answer)}
        onVote={async (vote) => update('answer', await answerApi.vote(answer.id, vote))} />
      <div className="qa-a-selection">
        {canSelect ? <button type="button" className={answer.selected ? 'qa-a-unselect-button' : 'qa-a-select-button'}
          title={answer.selected ? m.answer.unselect : m.answer.select} aria-label={answer.selected ? m.answer.unselect : m.answer.select}
          aria-pressed={answer.selected} disabled={action.busy}
          onClick={() => action.run(async () => setAnswers(await questions.select(question.id, answer.selected ? null : answer.id)))}>
          <Check size={34} aria-hidden="true" />
        </button> : answer.selected && <div className="qa-a-selected" title={m.answer.selected}><Check size={34} aria-hidden="true" /></div>}
        {answer.selected && <span className="qa-a-selected-text">{m.answer.selected}</span>}
      </div>
    </div>
    <div className="qa-a-item-main">
      <span className="qa-a-item-avatar-meta"><span className="qa-a-item-meta">
        <PostMeta what={m.meta.answered} when={answer.created_at} handle={answer.author_handle} points={answer.author_points}
          extra={<>{answer.hidden && <> · <strong>{m.meta.hidden}</strong></>}
            {editor && answer.flag_count > 0 && <span className="qa-q-item-flags">
              {answer.flag_count === 1 ? m.meta.flag : fmt(m.meta.flags, { count: answer.flag_count })}</span>}</>} />
      </span></span>
      {editing ? <TextForm id={`a${answer.id}-edit`} label={m.answer.editTitle} rich
        initial={answer.format === 'html' ? answer.body : textToHtml(answer.body)} submitLabel={m.question.save}
        lengthError={m.answer.lengthError} onCancel={() => setEditing(false)}
        onSubmit={async (body) => { update('answer', await answerApi.update(answer.id, body, 'html')); setEditing(false); return true }} />
        : <PostContent text={answer.body} format={answer.format} className="qa-a-item-content" />}
      {action.error && <Notice kind="error">{action.error}</Notice>}
      {!editing && <div className="qa-a-item-buttons">
        {!answer.hidden && ctx.canRespond && <LightButton kind="comment" icon={MessageSquare} wide label={m.answer.comment}
          title={m.answer.commentTitle} onClick={() => setCommenting(true)} />}
        <span className="qa-buttons-spacer" />
        {!answer.hidden && (own || editor) && !user.blocked && <LightButton kind="edit" icon={Pencil} label={m.answer.edit}
          title={m.answer.editTitle} onClick={() => setEditing(true)} />}
        {!answer.hidden && !own && !user.blocked && <LightButton kind={answer.my_flag ? 'unflag' : 'flag'} icon={Flag}
          label={answer.my_flag ? m.answer.unflag : m.answer.flag} title={answer.my_flag ? m.question.unflagTitle : m.answer.flagTitle}
          disabled={action.busy} onClick={() => call(() => answerApi.flag(answer.id, !answer.my_flag))} />}
        {editor && answer.flag_count > 0 && <LightButton kind="clearflags" icon={Eraser} label={m.question.clearFlags}
          title={m.question.clearFlagsTitle} disabled={action.busy} onClick={() => call(() => answerApi.clearFlags(answer.id))} />}
        {!answer.hidden && (own || editor) && <LightButton kind="hide" icon={EyeOff} label={m.answer.hide} title={m.answer.hideTitle}
          disabled={action.busy} onClick={() => call(() => answerApi.hide(answer.id))} />}
        {answer.hidden && editor && <LightButton kind="reshow" icon={Eye} label={m.answer.reshow}
          disabled={action.busy} onClick={() => call(() => answerApi.reshow(answer.id))} />}
        {answer.hidden && atLeast(user, 'moderator') && <LightButton kind="delete" icon={Trash2} label={m.answer.delete}
          disabled={action.busy} onClick={() => window.confirm(m.answer.confirmDelete) && action.run(async () => {
            await answerApi.remove(answer.id); remove('answer', answer.id)
          })} />}
      </div>}
      <Comments list={ctx.comments.filter((comment) => comment.answer_id === answer.id)} ctx={ctx}
        open={commenting} setOpen={setCommenting} parent={{ kind: 'a', id: answer.id }} />
    </div>
  </div>
}

function CloseForm({ question, onDone, onCancel }) {
  const [mode, setMode] = useState('other')
  const [reason, setReason] = useState('')
  const [duplicate, setDuplicate] = useState('')
  const action = useAction()
  return <form className="qa-part-form" onSubmit={(event) => {
    event.preventDefault()
    action.run(async () => onDone(await questions.close(question.id,
      mode === 'duplicate' ? { duplicate_of: Number(duplicate) } : { reason: reason.trim() })))
  }}>
    <h2>{m.question.closeForm}</h2>
    <label className="qa-checkbox-label"><input type="radio" name="close-mode" checked={mode === 'duplicate'}
      onChange={() => setMode('duplicate')} /> {m.question.closeDuplicate}</label>
    <label className="qa-checkbox-label"><input type="radio" name="close-mode" checked={mode === 'other'}
      onChange={() => setMode('other')} /> {m.question.closeOther}</label>
    {mode === 'duplicate' ? <>
      <label className="qa-form-tall-label" htmlFor="close-duplicate">{m.question.closeDuplicateLabel}</label>
      <input id="close-duplicate" inputMode="numeric" value={duplicate} onChange={(event) => setDuplicate(event.target.value)} />
    </> : <>
      <label className="qa-form-tall-label" htmlFor="close-reason">{m.question.closeReasonLabel}</label>
      <input id="close-reason" className="qa-form-tall-text" maxLength={800} value={reason} onChange={(event) => setReason(event.target.value)} />
    </>}
    {action.error && <span className="qa-form-tall-error" role="alert">{action.error}</span>}
    <div className="qa-form-tall-buttons">
      <button className="qa-form-tall-button" disabled={action.busy}>{m.question.closeButton}</button>
      <button type="button" className="qa-form-tall-button qa-form-tall-button-cancel" onClick={onCancel}>{m.question.cancel}</button>
    </div>
  </form>
}

function EditQuestion({ question, onSaved, onCancel }) {
  const { categories } = useChrome()
  const [draft, setDraft] = useState({
    title: question.title, body: question.format === 'html' ? question.body : textToHtml(question.body), tags: question.tags.join(' '), category_id: question.category_id ?? ''
  })
  const [errors, setErrors] = useState({})
  const action = useAction()
  const flow = useImprovement(draft)
  const locked = action.busy || flow.busy || Boolean(flow.result?.suggestion)
  async function save(event) {
    event.preventDefault()
    const found = questionErrors(draft)
    setErrors(found)
    if (Object.keys(found).length) return
    const clean = cleanQuestion(draft)
    await action.run(async () => onSaved(await questions.update(question.id, clean)))
  }
  return <form className="qa-part-form qa-part-form-q-edit" onSubmit={save}>
    <h2>{m.ask.editHeading}</h2>
    <QuestionFields draft={draft} errors={{ ...flow.errors, ...errors }} disabled={locked} categories={categories}
      onChange={(next) => { setDraft(next); flow.reset() }}
      afterTitle={<><ImproveButton busy={flow.busy} disabled={locked} onClick={flow.improve} />
        <Improvement flow={flow} onAccept={(revised) => { setDraft(revised); flow.reset() }} onKeep={flow.reset} /></>} />
    {action.error && <Notice kind="error">{action.error}</Notice>}
    <div className="qa-form-tall-buttons">
      <button className="qa-form-tall-button qa-form-tall-button-save" disabled={locked}>{m.question.saveChanges}</button>
      <button type="button" className="qa-form-tall-button qa-form-tall-button-cancel" onClick={onCancel}>{m.question.cancel}</button>
    </div>
  </form>
}

function QuestionView({ data, setData }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { question, answers, comments } = data
  const [mode, setMode] = useState(null) // edit | close
  const [commenting, setCommenting] = useState(false)
  const [answering, setAnswering] = useState(answers.length === 0)
  const action = useAction()
  const own = question.user_id === user.id
  const editor = atLeast(user, 'editor')
  const canRespond = !question.closed && !question.hidden && !user.blocked
  const setQuestion = (next) => setData((previous) => ({ ...previous, question: { ...previous.question, ...next } }))
  const call = (fn) => action.run(async () => setQuestion(await fn()))

  const ctx = {
    user, comments, canRespond,
    update: (kind, post) => setData((previous) => ({
      ...previous, [`${kind}s`]: previous[`${kind}s`].map((item) => item.id === post.id ? post : item)
    })),
    add: (kind, post) => setData((previous) => ({
      ...previous, [`${kind}s`]: [...previous[`${kind}s`], post],
      question: kind === 'answer' ? { ...previous.question, answer_count: previous.question.answer_count + 1 } : previous.question
    })),
    remove: (kind, id) => setData((previous) => ({ ...previous, [`${kind}s`]: previous[`${kind}s`].filter((item) => item.id !== id) })),
    setAnswers: ({ question: next, answers: list }) => setData((previous) => ({ ...previous, question: next, answers: list })),
  }
  const responses = answers.length + comments.length
  const canDelete = (own && !question.hidden && responses === 0) || (question.hidden && atLeast(user, 'moderator'))
  const visibleAnswers = answers.filter((answer) => !answer.hidden).length

  return <>
    <Heading hidden={question.hidden} extra={!question.hidden && <div className="qa-favoriting">
      <button type="button" className={question.favorited ? 'qa-unfavorite-button' : 'qa-favorite-button'}
        title={question.favorited ? m.question.unfavorite : m.question.favorite}
        aria-label={question.favorited ? m.question.unfavorite : m.question.favorite} aria-pressed={question.favorited}
        disabled={action.busy} onClick={() => call(() => questions.favorite(question.id, !question.favorited))}>
        <Star size={30} fill={question.favorited ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </div>}>
      {question.closed && <span className="qam-q-view-close-icon" title={m.list.closedTitle}><Lock size={16} aria-hidden="true" /></span>}
      <Link to={questionUrl(question)}>{question.title}</Link>
    </Heading>
    {question.hidden && <Notice kind="warning">{m.question.hiddenNotice}</Notice>}
    {action.error && <Notice kind="error">{action.error}</Notice>}

    {mode === 'edit' ? <EditQuestion question={question} onCancel={() => setMode(null)}
      onSaved={(next) => { setQuestion(next); setMode(null) }} /> : <div className="qa-part-q-view">
      <div className={'qa-q-view' + (question.hidden ? ' qa-main-hidden' : '')} id={`q${question.id}`}>
        <div className="qa-q-view-stats">
          <VoteBox post={question} disabledReason={voteBlockReason(user, question)}
            onVote={async (vote) => setQuestion(await questions.vote(question.id, vote))} />
          <span className="qa-view-count">{fmt(m.question.views, { count: question.views })}</span>
        </div>
        <div className="qa-q-view-main">
          <span className="qa-q-view-avatar-meta"><span className="qa-q-view-meta">
            <PostMeta what={m.meta.asked} when={question.created_at} handle={question.author_handle} points={question.author_points}
              category={question.category_slug ? { slug: question.category_slug, title: question.category_title } : null}
              extra={editor && question.flag_count > 0 && <span className="qa-q-item-flags">
                {question.flag_count === 1 ? m.meta.flag : fmt(m.meta.flags, { count: question.flag_count })}</span>} />
          </span></span>
          <PostContent text={question.body} format={question.format} className="qa-q-view-content" />
          {question.closed && <div className="qa-q-view-closed">
            {question.duplicate_of ? <>{m.question.closedDuplicate} <Link to={`/${question.duplicate_of}`}>#{question.duplicate_of}</Link></>
              : <>{m.question.closedReason} <span className="qa-q-view-closed-content">{question.close_reason}</span></>}
          </div>}
          <div className="qa-q-view-tags"><TagList tags={question.tags} /></div>
          <div className="qa-q-view-buttons">
            {canRespond && <LightButton kind="answer" icon={MessageSquare} wide label={m.question.answer} title={m.question.answerTitle}
              onClick={() => { setAnswering(true); requestAnimationFrame(() => document.getElementById('answer-body')?.focus()) }} />}
            {canRespond && <LightButton kind="comment" icon={MessageSquare} wide label={m.question.comment}
              title={m.question.commentTitle} onClick={() => setCommenting(true)} />}
            <span className="qa-buttons-spacer" />
            {!question.hidden && (own || editor) && !user.blocked && <LightButton kind="edit" icon={Pencil} label={m.question.edit}
              title={m.question.editTitle} onClick={() => setMode('edit')} />}
            {!question.hidden && !own && !user.blocked && <LightButton kind={question.my_flag ? 'unflag' : 'flag'}
              icon={question.my_flag ? FlagOff : Flag} label={question.my_flag ? m.question.unflag : m.question.flag}
              title={question.my_flag ? m.question.unflagTitle : m.question.flagTitle} disabled={action.busy}
              onClick={() => call(() => questions.flag(question.id, !question.my_flag))} />}
            {editor && question.flag_count > 0 && <LightButton kind="clearflags" icon={Eraser} label={m.question.clearFlags}
              title={m.question.clearFlagsTitle} disabled={action.busy} onClick={() => call(() => questions.clearFlags(question.id))} />}
            {!question.hidden && (own || editor) && !user.blocked && (question.closed
              ? <LightButton kind="reopen" icon={LockOpen} label={m.question.reopen} title={m.question.reopenTitle}
                disabled={action.busy} onClick={() => call(() => questions.reopen(question.id))} />
              : <LightButton kind="close" icon={Lock} label={m.question.close} title={m.question.closeTitle}
                onClick={() => setMode(mode === 'close' ? null : 'close')} />)}
            {!question.hidden && (own || editor) && <LightButton kind="hide" icon={EyeOff} label={m.question.hide} title={m.question.hideTitle}
              disabled={action.busy} onClick={() => window.confirm(m.question.confirmHide) && action.run(async () => {
                const result = await questions.hide(question.id)
                if (result?.question) setQuestion(result.question)
                else navigate('/questions', { replace: true })
              })} />}
            {question.hidden && editor && <LightButton kind="reshow" icon={Eye} label={m.question.reshow} title={m.question.reshowTitle}
              disabled={action.busy} onClick={() => call(() => questions.reshow(question.id))} />}
            {canDelete && <LightButton kind="delete" icon={Trash2} label={m.question.delete} title={m.question.deleteTitle}
              disabled={action.busy} onClick={() => window.confirm(m.question.confirmDelete) && action.run(async () => {
                await questions.remove(question.id)
                navigate('/questions', { replace: true })
              })} />}
          </div>
          {mode === 'close' && <CloseForm question={question} onCancel={() => setMode(null)}
            onDone={(next) => { setQuestion(next); setMode(null) }} />}
          <Comments list={comments.filter((comment) => !comment.answer_id)} ctx={ctx} open={commenting} setOpen={setCommenting}
            parent={{ kind: 'q', id: question.id }} />
        </div>
      </div>
    </div>}

    {answering && canRespond && <div className="qa-part-a-form qa-part-form">
      <h2>{m.question.yourAnswer}</h2>
      <TextForm id="answer-body" label={m.answer.placeholder} submitLabel={m.question.addAnswer} autoFocus={false} rich
        lengthError={m.answer.lengthError} onCancel={answers.length ? () => setAnswering(false) : undefined}
        onSubmit={async (body) => { ctx.add('answer', await questions.answer(question.id, body, 'html')); setAnswering(false); return true }} />
    </div>}

    {answers.length > 0 && <div className="qa-part-a-list">
      <h2 id="a_list_title">{visibleAnswers === 1 ? m.question.answerTitleOne : fmt(m.question.answersTitle, { count: visibleAnswers })}</h2>
      <div className="qa-a-list">
        {answers.map((answer) => <AnswerItem key={answer.id} answer={answer} question={question} ctx={ctx} />)}
      </div>
    </div>}
  </>
}

export function QuestionPage() {
  const { id, slug } = useParams()
  const valid = /^[1-9]\d{0,9}$/.test(id)
  const state = useLoad((signal) => valid ? questions.get(id, signal) : Promise.reject(Object.assign(new Error(m.question.notFound), { status: 404 })), [id])
  const { setRelated } = useChrome()
  // The layout clears related questions on navigation, including the slug redirect.
  useEffect(() => { setRelated(state.data?.related || null) }, [state.data?.related, setRelated, slug])
  if (state.loading) return <Loading />
  if (state.error) return <>
    <Heading>{state.status === 404 ? m.question.notFound : m.headings.notFound}</Heading>
    <Notice kind="error">{state.error}</Notice>
  </>
  const expected = slugify(state.data.question.title) || 'question'
  if (slug !== expected) return <Navigate to={`/${id}/${expected}${window.location.hash}`} replace />
  return <QuestionView data={state.data} setData={state.setData} />
}
