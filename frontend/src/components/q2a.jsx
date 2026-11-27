import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { atLeast, questions } from '../services/api'
import messages from '../../../lang/message/en/messages.json'
import { Avatar, compact, fmt, Notice, PageLinks, plural, Points, questionUrl, UserLink, When } from './ui'

const m = messages.q2a

// Up/down vote box (qa-voting). onVote receives 1, -1 or 0 and returns a promise.
export function VoteBox({ post, onVote, disabledReason }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const vote = post.my_vote || 0
  const disabled = busy || Boolean(disabledReason)
  async function cast(value) {
    setBusy(true)
    setError('')
    try {
      await onVote(vote === value ? 0 : value)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const upTitle = disabledReason || (vote === 1 ? m.vote.removeUp : m.vote.upTitle)
  const downTitle = disabledReason || (vote === -1 ? m.vote.removeDown : m.vote.downTitle)
  return <div className="qa-voting" title={error || undefined}>
    <div className="qa-vote-buttons">
      <button type="button" className={'qa-vote-button qa-vote-up' + (vote === 1 ? ' qa-voted-up' : '')}
        title={upTitle} aria-label={upTitle} aria-pressed={vote === 1} disabled={disabled} onClick={() => cast(1)} />
      <button type="button" className={'qa-vote-button qa-vote-down' + (vote === -1 ? ' qa-voted-down' : '')}
        title={downTitle} aria-label={downTitle} aria-pressed={vote === -1} disabled={disabled} onClick={() => cast(-1)} />
    </div>
    <div className="qa-netvote-count">
      <span className="qa-netvote-count-data">{post.netvotes > 0 ? '+' : ''}{compact(post.netvotes)}</span>
      <span className="qa-netvote-count-pad">{plural(Math.abs(post.netvotes), m.list.vote, m.list.votes)}</span>
    </div>
    {error && <span className="sr-only" role="alert">{error}</span>}
  </div>
}

export function voteBlockReason(user, post) {
  if (!user) return m.vote.disabled
  if (post.user_id === user.id) return m.vote.ownPost
  if (post.hidden || user.blocked) return m.vote.disabled
  return ''
}

export function AnswerCount({ question }) {
  const count = question.answer_count
  const className = 'qa-a-count' + (count === 0 ? ' qa-a-count-zero' : '') +
    (question.selected_answer_id ? ' qa-a-count-selected' : '')
  return <div className={className}>
    <div className="qa-a-count-inner">
      <span className="qa-a-count-data">{compact(count)}</span>
      <span className="qa-a-count-pad">{plural(count, m.list.answer, m.list.answers)}</span>
    </div>
  </div>
}

export function TagList({ tags }) {
  if (!tags?.length) return null
  return <ul className="qa-tag-list">
    {tags.map((tag) => <li key={tag}><Link className="qa-tag-link" to={`/tag/${encodeURIComponent(tag)}`}>{tag}</Link></li>)}
  </ul>
}

// "asked 2 hours ago in Category by handle (120 points)"
export function PostMeta({ what, when, category, handle, points, extra, avatar = false }) {
  return <span className="qa-q-item-meta">
    {avatar && <Avatar />}
    <span className="qa-q-item-what">{what}</span>{' '}
    <When value={when} />
    {category && <> {m.meta.in} <Link className="qa-category-link" to={`/questions/${encodeURIComponent(category.slug)}`}>{category.title}</Link></>}
    {' '}{m.meta.by} <UserLink handle={handle} /><Points points={points} />
    {extra}
  </span>
}

const categoryOf = (question) => question.category_slug
  ? { slug: question.category_slug, title: question.category_title } : null

export function QuestionItem({ question, onChange }) {
  const { user } = useAuth()
  const activity = question.activity
  const meta = activity
    ? { what: m.meta[activity.what], when: activity.at, handle: activity.handle }
    : { what: m.meta.asked, when: question.created_at, handle: question.author_handle }
  return <div className={'qa-q-list-item' + (question.favorited ? ' qa-q-favorited' : '')} id={`q${question.id}`}>
    <div className="qa-q-item-stats">
      <VoteBox post={question} disabledReason={voteBlockReason(user, question)}
        onVote={async (vote) => onChange?.(await questions.vote(question.id, vote))} />
      <AnswerCount question={question} />
      <span className="qa-view-count"><span className="qa-view-count-data">{compact(question.views)}</span>{' '}
        <span className="qa-view-count-pad">{plural(question.views, m.list.view, m.list.views)}</span></span>
    </div>
    <div className="qa-q-item-main">
      <div className="qa-q-item-title">
        {question.closed && <span className="qam-q-list-close-icon" title={m.list.closedTitle}>
          <Lock size={12} aria-hidden="true" /><span className="sr-only">{m.list.closed}</span>
        </span>}
        <Link to={questionUrl(question)}>{question.title}</Link>
      </div>
      <span className="qa-q-item-avatar-meta">
        <PostMeta {...meta} avatar category={categoryOf(question)}
          extra={atLeast(user, 'editor') && question.flag_count > 0 &&
            <span className="qa-q-item-flags">{question.flag_count === 1 ? m.meta.flag : fmt(m.meta.flags, { count: question.flag_count })}</span>} />
      </span>
      <div className="qa-q-item-tags"><TagList tags={question.tags} /></div>
    </div>
  </div>
}

export function QuestionList({ state, empty, suggest = true }) {
  const { data } = state
  if (!data.questions.length) return <>
    <div className="qa-part-q-list"><Notice kind="warning">{empty || m.list.empty}</Notice></div>
    {suggest && <SuggestNext empty />}
  </>
  const replace = (question) => state.setData((previous) => ({
    ...previous,
    questions: previous.questions.map((item) => item.id === question.id ? { ...item, ...question, activity: item.activity } : item)
  }))
  return <>
    <div className="qa-part-q-list"><div className="qa-q-list">
      {data.questions.map((question) => <QuestionItem key={question.id} question={question} onChange={replace} />)}
    </div></div>
    <PageLinks page={data.page} total={data.total} pageSize={data.pageSize} />
    {suggest && <SuggestNext />}
  </>
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SUGGEST_LINKS = new RegExp(`(${escapeRegExp(m.list.fullList)}|${escapeRegExp(m.list.popularTags)})`)

export function SuggestNext({ empty = false }) {
  if (empty) return <div className="qa-suggest-next"><Link to="/ask">{m.list.suggestAsk}</Link></div>
  return <div className="qa-suggest-next">
    {m.list.suggestMore.split(SUGGEST_LINKS).map((part) =>
      part === m.list.fullList ? <Link key={part} to="/questions">{part}</Link>
        : part === m.list.popularTags ? <Link key={part} to="/tags">{part}</Link> : part)}
  </div>
}
