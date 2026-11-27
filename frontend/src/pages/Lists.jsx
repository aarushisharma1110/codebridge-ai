import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import { atLeast, browse, questions } from '../services/api'
import { useLoad } from '../hooks/useResource'
import { useAuth } from '../context/AuthContext'
import { useChrome } from '../components/Layout'
import { QuestionList } from '../components/q2a'
import { compact, fmt, Heading, Notice, PageLinks, Resource } from '../components/ui'
import messages from '../../../lang/message/en/messages.json'

const m = messages.q2a
const usePage = () => useSearchParams()[0].get('page') || undefined

// Q2A's "Ask Box" widget: type a title and continue to the Ask page with it.
function AskBox() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  return <form className="qa-ask-box" onSubmit={(event) => {
    event.preventDefault()
    navigate('/ask', { state: { draft: { title: title.trim() } } })
  }}>
    <label className="qa-ask-box-label" htmlFor="qa-ask-box-title">{m.askBox.label}</label>
    <input id="qa-ask-box-title" className="qa-ask-box-text" value={title} onChange={(event) => setTitle(event.target.value)} />
    <button className="sr-only">{m.askBox.button}</button>
  </form>
}

export function ActivityPage() {
  const page = usePage()
  const state = useLoad((signal) => browse.activity({ page }, signal), [page])
  return <>
    <AskBox />
    <Heading>{m.headings.activity}</Heading>
    <Resource state={state}>{() => <QuestionList state={state} empty={m.list.emptyActivity} />}</Resource>
  </>
}

const SORT_HEADINGS = { recent: 'recent', hot: 'hot', votes: 'votes', answers: 'answers', views: 'views' }

export function QuestionsPage() {
  const { category } = useParams()
  const [params] = useSearchParams()
  const { categories } = useChrome()
  const sort = SORT_HEADINGS[params.get('sort')] ? params.get('sort') : 'recent'
  const page = params.get('page') || undefined
  const state = useLoad((signal) => questions.list({ sort, page, category }, signal), [sort, page, category])
  const current = categories.find((item) => item.slug === category)
  const heading = m.headings[SORT_HEADINGS[sort]]
  return <>
    <Heading>{category ? fmt(m.headings.inCategory, { heading, category: current?.title || category }) : heading}</Heading>
    <Resource state={state}>{() => <QuestionList state={state} />}</Resource>
  </>
}

export function UnansweredPage() {
  const [params] = useSearchParams()
  const by = ['selected', 'upvotes'].includes(params.get('by')) ? params.get('by') : 'none'
  const page = params.get('page') || undefined
  const state = useLoad((signal) => questions.list({ unanswered: by, page }, signal), [by, page])
  const heading = { none: m.headings.unanswered, selected: m.headings.unselected, upvotes: m.headings.unupvoted }[by]
  return <>
    <Heading>{heading}</Heading>
    <Resource state={state}>{() => <QuestionList state={state} empty={m.list.emptyUnanswered} />}</Resource>
  </>
}

export function TagPage() {
  const { tag } = useParams()
  const page = usePage()
  const state = useLoad((signal) => questions.list({ tag, page }, signal), [tag, page])
  const [favorited, setFavorited] = useState(null)
  const tags = useLoad((signal) => browse.favorites(signal).then((data) => data.tags.some((item) => item.tag === tag)), [tag])
  const isFavorite = favorited ?? tags.data
  async function toggle() {
    await browse.favoriteTag(tag, !isFavorite)
    setFavorited(!isFavorite)
  }
  return <>
    <Heading extra={tags.data !== undefined && <div className="qa-favoriting">
      <button type="button" className={isFavorite ? 'qa-unfavorite-button' : 'qa-favorite-button'} onClick={toggle}
        title={isFavorite ? m.favorites.unfavoriteTag : m.favorites.favoriteTag}
        aria-label={isFavorite ? m.favorites.unfavoriteTag : m.favorites.favoriteTag} aria-pressed={Boolean(isFavorite)}>
        <Star size={30} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
      </button></div>}>{fmt(m.headings.tag, { tag })}</Heading>
    <Resource state={state}>{() => <QuestionList state={state} />}</Resource>
  </>
}

export function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') || '').trim()
  const page = params.get('page') || undefined
  const state = useLoad((signal) => q ? questions.list({ q, page }, signal)
    : Promise.resolve({ questions: [], total: 0, page: 1, pageSize: 20 }), [q, page])
  return <>
    <Heading>{q ? fmt(m.headings.search, { query: q }) : m.headings.searchEmpty}</Heading>
    <Resource state={state}>{() => <QuestionList state={state} suggest={false}
      empty={q ? fmt(m.list.emptySearch, { query: q }) : m.list.empty} />}</Resource>
  </>
}

export function TagsPage() {
  const page = usePage()
  const state = useLoad((signal) => browse.tags({ page }, signal), [page])
  return <>
    <Heading>{m.headings.tags}</Heading>
    <Resource state={state}>{(data) => data.tags.length ? <>
      <div className="qa-part-ranking">
        <ul className="qa-ranking-list qa-top-tags">
          {data.tags.map(({ tag, count, favorited }) => <li className="qa-ranking-item qa-top-tags-item" key={tag}>
            <Link className={'qa-tag-link' + (favorited ? ' qa-tag-favorited' : '')} to={`/tag/${encodeURIComponent(tag)}`}>{tag}</Link>
            <span className="qa-top-tags-count">× {compact(count)}</span>
          </li>)}
        </ul>
      </div>
      <PageLinks page={data.page} total={data.total} pageSize={data.pageSize} />
    </> : <Notice kind="warning">{m.list.emptyTags}</Notice>}</Resource>
  </>
}

export function CategoriesPage() {
  const state = useLoad((signal) => browse.categories(signal), [])
  return <>
    <Heading>{m.headings.categories}</Heading>
    <Resource state={state}>{(categories) => {
      if (!categories.length) return <Notice kind="warning">{m.list.emptyCategories}</Notice>
      const item = (category) => {
        const children = categories.filter((child) => child.parent_id === category.id)
        return <li className="qa-browse-cat-item" key={category.id}>
          <Link className="qa-browse-cat-link" to={`/questions/${encodeURIComponent(category.slug)}`}>{category.title}</Link>
          <Link className="qa-browse-cat-count" to={`/questions/${encodeURIComponent(category.slug)}`}>
            {compact(category.question_count)} {category.question_count === 1 ? m.list.question : m.list.questionsCount}
          </Link>
          {category.description && <span className="qa-browse-cat-note">{category.description}</span>}
          {children.length > 0 && <ul className="qa-browse-cat-list">{children.map(item)}</ul>}
        </li>
      }
      return <div className="qa-part-nav-list">
        <ul className="qa-browse-cat-list">{categories.filter((category) => !category.parent_id).map(item)}</ul>
      </div>
    }}</Resource>
  </>
}

export function UsersPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const sort = { '/users/newest': 'newest', '/users/special': 'special', '/users/blocked': 'blocked' }[pathname] || 'points'
  const page = usePage()
  const state = useLoad((signal) => browse.users({ sort, page }, signal), [sort, page])
  const heading = { points: m.headings.users, newest: m.headings.newestUsers, special: m.headings.specialUsers,
    blocked: m.headings.blockedUsers }[sort]
  if (sort === 'blocked' && !atLeast(user, 'moderator')) return <><Heading>{heading}</Heading>
    <Notice kind="error">{m.admin.moderatorOnly}</Notice></>
  return <>
    <Heading>{heading}</Heading>
    <Resource state={state}>{(data) => data.users.length ? <>
      <div className="qa-part-ranking">
        <ul className="qa-ranking-list qa-top-users">
          {data.users.map((row) => <li className="qa-ranking-item qa-top-users-item" key={row.id}>
            <span className="qa-top-users-label">
              <Link className="qa-user-link" to={`/user/${encodeURIComponent(row.handle)}`}>{row.handle}</Link>
              {row.role !== 'user' && <span className="qa-user-level">{m.user.titles[row.role]}</span>}
            </span>
            <span className="qa-top-users-score">{fmt(m.nav.points, { points: compact(row.points) })}</span>
          </li>)}
        </ul>
      </div>
      <PageLinks page={data.page} total={data.total} pageSize={data.pageSize} />
    </> : <Notice kind="warning">{m.list.emptyUsers}</Notice>}</Resource>
  </>
}
