import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const now = new Date().toISOString()
const member = { id: 1, handle: 'member', email: 'member@example.com', role: 'user', created_at: now, blocked: false }
const admin = { ...member, id: 3, handle: 'boss', role: 'admin' }
const summary = (overrides = {}) => ({
  id: 8, user_id: 1, title: 'How do I handle errors?', body: 'I am using React.', created_at: now, updated_at: now,
  last_edited_by: null, hidden: false, category_id: null, category_title: null, category_slug: null, views: 3,
  selected_answer_id: null, closed: false, close_reason: null, duplicate_of: null, author_handle: 'member',
  author_role: 'user', author_points: 120, tags: ['react'], answer_count: 0, upvotes: 0, downvotes: 0, netvotes: 0,
  my_vote: 0, favorited: false, flag_count: 0, my_flag: false, ...overrides,
})
const own = summary()
const shared = summary({ id: 9, user_id: 2, title: 'How do I use PostgreSQL?', author_handle: 'other', tags: ['sql'] })
const page = (questions) => ({ questions, total: questions.length, page: 1, pageSize: 20 })
const answer = (overrides = {}) => ({
  id: 31, question_id: 8, user_id: 2, body: 'Check the status code first.', created_at: now, updated_at: now,
  last_edited_by: null, hidden: false, author_handle: 'other', author_role: 'user', author_points: 140, selected: false,
  upvotes: 0, downvotes: 0, netvotes: 0, my_vote: 0, flag_count: 0, my_flag: false, ...overrides,
})
const site = { site_title: 'CodeBridge AI', welcome_text: 'Welcome text', show_welcome: 'true', footer_text: '',
  counts: { questions: 2, answers: 1, comments: 0, users: 3 } }

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})
const unauthenticated = () => json({ message: 'Authentication required' }, 401)

function start(path, { account = member, routes = {} } = {}) {
  const fetch = vi.fn(async (url, options) => {
    const parsed = new URL(url, 'http://localhost')
    const pathname = parsed.pathname.replace(/^\/api\/v1/, '')
    const key = options.method + ' ' + pathname
    if (key in routes) return routes[key](options, parsed.searchParams)
    if (key === 'GET /auth/me') return account ? json({ user: account }) : unauthenticated()
    if (key === 'GET /site') return json({ site })
    if (key === 'GET /categories') return json({ categories: [] })
    if (key === 'GET /usage') return json({ totalUsage: 1, freeAllowance: 20, remainingCalls: 19, limitExceeded: false,
      allowanceExhausted: false, breakdown: [] })
    if (key === 'GET /activity' || key === 'GET /questions') return json(page([own, shared]))
    if (key === 'GET /questions/8') return json({ question: own, answers: [], comments: [], related: [] })
    if (key === 'GET /questions/9') return json({ question: shared, answers: [], comments: [], related: [] })
    if (key.startsWith('GET /users/')) return json({ user: { handle: 'member', points: 120 } })
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  const view = render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return { fetch, user: userEvent.setup(), unmount: view.unmount }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockImplementation(() => true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('session and authorization', () => {
  it('protects deep links, accepts a username login and returns to the question', async () => {
    const session = vi.fn().mockImplementationOnce(unauthenticated).mockImplementation(() => json({ user: member }))
    const login = vi.fn(() => json({ user: member }))
    const { user, fetch } = start('/8/how-do-i-handle-errors', { routes: { 'GET /auth/me': session, 'POST /auth/login': login } })
    await screen.findByRole('heading', { name: 'Log in' })
    expect(screen.getByText('Please log in or register to view this page.')).toBeTruthy()
    const form = screen.getByRole('button', { name: 'Log In' }).closest('form')
    await user.click(within(form).getByRole('button', { name: 'Log In' }))
    expect(within(form).getByText('Enter your email or username.')).toBeTruthy()
    expect(login).not.toHaveBeenCalled()
    await user.type(within(form).getByLabelText('Email or Username:'), 'member')
    await user.type(within(form).getByLabelText('Password:'), 'abc')
    await user.click(within(form).getByRole('button', { name: 'Log In' }))
    await screen.findByRole('link', { name: own.title })
    expect(JSON.parse(login.mock.calls[0][0].body)).toEqual({ email: 'member', password: 'abc' })
    expect(fetch.mock.calls.every(([, options]) => options.credentials === 'include')).toBe(true)
  })

  it('stays on the login page when accepted credentials do not establish a session', async () => {
    const { user } = start('/login', { account: null, routes: { 'POST /auth/login': () => json({ user: member }) } })
    const form = (await screen.findByRole('button', { name: 'Log In' })).closest('form')
    await user.type(within(form).getByLabelText('Email or Username:'), member.email)
    await user.type(within(form).getByLabelText('Password:'), 'a passphrase')
    await user.click(within(form).getByRole('button', { name: 'Log In' }))
    expect((await within(form).findByRole('alert')).textContent).toContain('could not establish a session')
  })

  it('validates registration with a username, shows a duplicate error and redirects after success', async () => {
    const register = vi.fn()
      .mockImplementationOnce(() => json({ message: 'That username is already taken.' }, 409))
      .mockImplementation(() => json({ user: { ...member, handle: 'newbie' } }, 201))
    const { user } = start('/register', { account: null, routes: { 'POST /auth/register': register } })
    await screen.findByRole('heading', { name: 'Register as a new user' })
    await user.type(screen.getByLabelText('Username:'), 'a b')
    await user.type(screen.getByLabelText('Email:'), 'new@example.com')
    await user.type(screen.getByLabelText('Password:'), 'short')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText('Usernames must be 2-20 letters, digits, dots, underscores or hyphens.')).toBeTruthy()
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy()
    expect(register).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Username:'))
    await user.type(screen.getByLabelText('Username:'), 'newbie')
    await user.type(screen.getByLabelText('Password:'), ' enough now')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('alert')).textContent).toBe('That username is already taken.')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    await screen.findByText('Registration complete. Please log in.')
    expect(JSON.parse(register.mock.calls[1][0].body)).toEqual({ handle: 'newbie', email: 'new@example.com', password: 'short enough now' })
  })

  it('hides administration from members and makes no admin API request', async () => {
    const { fetch } = start('/admin')
    await screen.findByText('Only administrators can see this page.')
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    expect(fetch.mock.calls.some(([url]) => url.includes('/admin/'))).toBe(false)
  })

  it('returns to login with a notice when a protected request receives 401', async () => {
    start('/', { routes: { 'GET /activity': unauthenticated } })
    await screen.findByRole('heading', { name: 'Log in' })
    expect(await screen.findByText('Your session ended. Log in to continue.')).toBeTruthy()
  })
})

describe('question lists', () => {
  it('sends the home page Ask box title to the Ask form', async () => {
    const { user } = start('/')
    await user.type(await screen.findByLabelText('Ask a question:'), 'How do I change the site title?')
    await user.keyboard('{Enter}')
    expect((await screen.findByLabelText('The question in one sentence:')).value).toBe('How do I change the site title?')
  })

  it('shows Q2A list items with vote and answer counts and votes from the list', async () => {
    const vote = vi.fn(() => json({ question: { ...shared, netvotes: 1, upvotes: 1, my_vote: 1 } }))
    const { user } = start('/', { routes: { 'POST /questions/9/vote': vote } })
    await screen.findByRole('heading', { name: 'Recent activity' })
    const item = (await screen.findByRole('link', { name: shared.title })).closest('.qa-q-list-item')
    expect(within(item).getByText('votes')).toBeTruthy()
    expect(within(item).getByText('answers')).toBeTruthy()
    expect(within(item).getByRole('link', { name: 'sql' }).getAttribute('href')).toBe('/tag/sql')
    const ownItem = screen.getByRole('link', { name: own.title }).closest('.qa-q-list-item')
    expect(within(ownItem).getAllByRole('button', { name: 'You cannot vote on your own post' }).every((button) => button.disabled)).toBe(true)
    await user.click(within(item).getByRole('button', { name: 'Click to vote up' }))
    await within(item).findByText('vote')
    expect(within(item).getByText('+1')).toBeTruthy()
    expect(within(item).getByText('views')).toBeTruthy()
    expect(JSON.parse(vote.mock.calls[0][0].body)).toEqual({ vote: 1 })
    expect(within(item).getByRole('button', { name: 'Click to remove your up vote' })).toBeTruthy()
  })

  it('switches sort order from the sub navigation and searches from the sidebar', async () => {
    const list = vi.fn(() => json(page([own])))
    const { user } = start('/questions', { routes: { 'GET /questions': (options, params) => list(params.toString()) } })
    await screen.findByRole('heading', { name: 'Recent questions' })
    await user.click(screen.getByRole('link', { name: 'Most votes' }))
    await screen.findByRole('heading', { name: 'Highest voted questions' })
    expect(list).toHaveBeenLastCalledWith('sort=votes')
    await user.type(screen.getAllByPlaceholderText('Search...')[0], 'react errors')
    await user.click(screen.getAllByRole('button', { name: 'Search' })[0])
    await screen.findByRole('heading', { name: 'Search results for react errors' })
    expect(list).toHaveBeenLastCalledWith('q=react+errors')
  })

  it('shows a genuine empty state for unanswered questions', async () => {
    start('/unanswered', { routes: { 'GET /questions': () => json(page([])) } })
    await screen.findByText('No questions without answers.')
    expect(screen.getByRole('link', { name: 'Help get things started by asking a question.' })).toBeTruthy()
  })
})

describe('question page', () => {
  it('posts a validated answer and lets the asker select it as best', async () => {
    const created = answer()
    const select = vi.fn(() => json({ question: { ...own, answer_count: 1, selected_answer_id: 31 },
      answers: [{ ...created, selected: true }] }))
    const { user } = start('/8/how-do-i-handle-errors', { routes: {
      'POST /questions/8/answers': () => json({ answer: created }, 201), 'POST /questions/8/select': select,
    } })
    await screen.findByRole('heading', { name: 'Your answer' })
    expect(screen.getByRole('button', { name: 'Delete this question permanently' })).toBeTruthy()
    await user.type(screen.getByLabelText('Write your answer here.'), 'too short')
    await user.click(screen.getByRole('button', { name: 'Add answer' }))
    expect(screen.getByRole('alert').textContent).toBe('Answers must be 12-12,000 characters.')
    await user.type(screen.getByLabelText('Write your answer here.'), ' but now long enough')
    await user.click(screen.getByRole('button', { name: 'Add answer' }))
    await screen.findByText('1 Answer')
    expect(screen.queryByRole('button', { name: 'Delete this question permanently' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Select as best answer' }))
    await screen.findByRole('button', { name: 'Remove selection as best answer' })
    expect(JSON.parse(select.mock.calls[0][0].body)).toEqual({ answer_id: 31 })
    expect(screen.getAllByText('Best answer').length).toBeGreaterThan(0)
  })

  it('lets readers flag and favorite but hides owner and moderator controls', async () => {
    const flag = vi.fn(() => json({ question: { ...shared, my_flag: true, flag_count: 1 } }))
    const favorite = vi.fn(() => json({ question: { ...shared, favorited: true } }))
    const { user } = start('/9/how-do-i-use-postgresql', { routes: {
      'POST /questions/9/flag': flag, 'POST /questions/9/favorite': favorite,
    } })
    await screen.findByRole('link', { name: shared.title })
    expect(screen.queryByRole('button', { name: 'Edit this question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide this question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete this question permanently' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Flag this question as spam or inappropriate' }))
    await screen.findByRole('button', { name: 'Remove the flag you added' })
    await user.click(screen.getByRole('button', { name: 'Add to my favorites' }))
    await screen.findByRole('button', { name: 'Remove from my favorites' })
  })

  it('lets an owner hide a question and returns to the list', async () => {
    const hide = vi.fn(() => new Response(null, { status: 204 }))
    const { user } = start('/8/how-do-i-handle-errors', { routes: { 'POST /questions/8/hide': hide } })
    await user.click(await screen.findByRole('button', { name: 'Hide this question' }))
    await screen.findByRole('heading', { name: 'Recent questions' })
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('lets administrators reshow a hidden question and see its moderation state', async () => {
    const hidden = { ...shared, hidden: true }
    const reshow = vi.fn(() => json({ question: { ...shared, hidden: false } }))
    const { user } = start('/9', { account: admin, routes: {
      'GET /questions/9': () => json({ question: hidden, answers: [], comments: [], related: [] }),
      'POST /questions/9/reshow': reshow,
    } })
    await screen.findByText('This question has been hidden.')
    await user.click(screen.getByRole('button', { name: 'Reshow this question' }))
    await waitFor(() => expect(screen.queryByText('This question has been hidden.')).toBeNull())
    expect(screen.getByRole('button', { name: 'Edit this question' })).toBeTruthy()
  })

  it('requires confirmation before deleting and redirects afterwards', async () => {
    const remove = vi.fn(() => new Response(null, { status: 204 }))
    window.confirm.mockImplementationOnce(() => false)
    const { user } = start('/8/how-do-i-handle-errors', { routes: { 'DELETE /questions/8': remove } })
    const button = await screen.findByRole('button', { name: 'Delete this question permanently' })
    await user.click(button)
    expect(remove).not.toHaveBeenCalled()
    await user.click(button)
    await screen.findByRole('heading', { name: 'Recent questions' })
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('edits a question inline with tags', async () => {
    const update = vi.fn((options) => json({ question: { ...own, ...JSON.parse(options.body), category_id: null } }))
    const { user } = start('/8/how-do-i-handle-errors', { routes: { 'PATCH /questions/8': update } })
    await user.click(await screen.findByRole('button', { name: 'Edit this question' }))
    const tags = screen.getByLabelText('Tags - use hyphens to combine words:')
    await user.clear(tags)
    await user.type(tags, 'React Errors')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await screen.findByRole('link', { name: 'errors' })
    expect(JSON.parse(update.mock.calls[0][0].body)).toEqual({
      title: own.title, body: `<p>${own.body}</p>`, format: 'html', tags: ['react', 'errors'], category_id: null,
    })
  })
})

describe('rich text posts', () => {
  it('renders sanitized HTML answers and strips scripts and event handlers', async () => {
    const html = answer({ format: 'html', body: '<p><b>Bold</b> text<img src="x" onerror="window.hacked=1"><script>window.hacked=1</script></p>' })
    start('/8/how-do-i-handle-errors', { routes: {
      'GET /questions/8': () => json({ question: { ...own, answer_count: 1 }, answers: [html], comments: [], related: [] }),
    } })
    const bold = await screen.findByText('Bold')
    expect(bold.tagName).toBe('B')
    const content = bold.closest('.qa-a-item-content')
    expect(content.innerHTML).not.toMatch(/onerror|script/)
    expect(window.hacked).toBeUndefined()
  })

  it('shows the CKEditor-style toolbar on the Ask form', async () => {
    start('/ask')
    const toolbar = await screen.findByRole('toolbar', { name: 'Formatting' })
    for (const name of ['Bold', 'Italic', 'Underline', 'Link', 'Image', 'Table', 'Block Quote', 'Undo']) {
      expect(within(toolbar).getByRole('button', { name })).toBeTruthy()
    }
  })
})

describe('asking with AI improvement', () => {
  it('validates, accepts an AI rewrite of the title and posts tags', async () => {
    const improve = vi.fn(() => json({ improvedQuestion: 'Why does my API return a 404 error?' }))
    const create = vi.fn((options) => json({ question: summary({ id: 12, ...JSON.parse(options.body) }) }, 201))
    const { user } = start('/ask', { routes: { 'POST /ai/improve-question': improve, 'POST /questions': create,
      'GET /questions/12': () => json({ question: summary({ id: 12, title: 'Why does my API return a 404 error?' }), answers: [], comments: [], related: [] }) } })
    await screen.findByRole('heading', { name: 'Ask a question' })
    await user.click(screen.getByRole('button', { name: 'Ask the Question' }))
    expect(screen.getByText('Enter a question title.')).toBeTruthy()
    await user.type(screen.getByLabelText('The question in one sentence:'), 'api 404')
    await user.click(screen.getByRole('button', { name: 'Improve with AI' }))
    await screen.findByRole('heading', { name: 'Review the suggestion' })
    expect(screen.getByLabelText('The question in one sentence:').value).toBe('api 404')
    await user.click(screen.getByRole('button', { name: 'Accept suggestion' }))
    expect(screen.getByLabelText('The question in one sentence:').value).toBe('Why does my API return a 404 error?')
    await user.type(screen.getByLabelText('Tags - use hyphens to combine words:'), 'express api')
    await user.click(screen.getByRole('button', { name: 'Ask the Question' }))
    await screen.findByRole('link', { name: 'Why does my API return a 404 error?' })
    expect(JSON.parse(create.mock.calls[0][0].body)).toEqual({
      title: 'Why does my API return a 404 error?', body: '', format: 'html', tags: ['express', 'api'], category_id: null,
    })
  })

  it('keeps the original when AI is unavailable and puts a long rewrite above the details', async () => {
    const long = 'What could cause my API to return a 404 for a route that exists, and how can I check the Express router mounting, the path prefix, and the HTTP method?'
    const improve = vi.fn()
      .mockImplementationOnce(() => json({ message: 'down' }, 503))
      .mockImplementation(() => json({ improvedQuestion: long }))
    const { user } = start('/ask', { routes: { 'POST /ai/improve-question': improve } })
    await user.type(await screen.findByLabelText('The question in one sentence:'), 'why my api returns 404')
    await user.type(screen.getByRole('textbox', { name: 'More information for the question:' }), 'Existing details')
    await user.click(screen.getByRole('button', { name: 'Improve with AI' }))
    expect((await screen.findByRole('alert')).textContent).toContain('AI improvement is temporarily unavailable')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    expect(screen.getByLabelText('The question in one sentence:').value).toBe('why my api returns 404')
    expect(screen.getByRole('textbox', { name: 'More information for the question:' }).innerHTML).toBe(`<p>${long}</p>Existing details`)
  })

  it('restores the unsaved draft after the same user logs in again', async () => {
    const session = vi.fn().mockImplementationOnce(() => json({ user: member })).mockImplementation(() => json({ user: member }))
    const create = vi.fn().mockImplementationOnce(unauthenticated)
    const { user } = start('/ask', { routes: { 'GET /auth/me': session, 'POST /questions': create,
      'POST /auth/login': () => json({ user: member }) } })
    await user.type(await screen.findByLabelText('The question in one sentence:'), 'How do I keep my draft?')
    await user.click(screen.getByRole('button', { name: 'Ask the Question' }))
    await screen.findByRole('heading', { name: 'Log in' })
    const form = screen.getByRole('button', { name: 'Log In' }).closest('form')
    await user.type(within(form).getByLabelText('Email or Username:'), 'member')
    await user.type(within(form).getByLabelText('Password:'), 'abc')
    await user.click(within(form).getByRole('button', { name: 'Log In' }))
    expect((await screen.findByLabelText('The question in one sentence:')).value).toBe('How do I keep my draft?')
  })
})

describe('consumption and administration', () => {
  it('shows usage counts and a non-blocking notice at the free allowance', async () => {
    const usage = { totalUsage: 21, freeAllowance: 20, remainingCalls: 0, limitExceeded: true, allowanceExhausted: true,
      breakdown: [{ method: 'GET', endpoint: '/api/v1/questions', count: 21, errorCount: 0 }] }
    const { user } = start('/', { routes: { 'GET /usage': () => json(usage) } })
    await screen.findByText(/You have used all 20 free API calls/)
    expect(screen.getByRole('link', { name: own.title })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'API usage' }))
    await screen.findByRole('heading', { name: 'API usage' })
    expect(screen.getAllByText('21').length).toBeGreaterThan(0)
    expect(screen.getByText('/api/v1/questions')).toBeTruthy()
  })

  it('shows administrator API statistics by user and endpoint with filtering', async () => {
    const stats = { byUser: [{ user_id: 1, email: 'member@example.com', count: 4 }],
      byEndpoint: [{ method: 'GET', endpoint: '/api/v1/questions', count: 3, errorCount: 0 },
        { method: 'POST', endpoint: '/api/v1/ai/improve-question', count: 1, errorCount: 1 }] }
    const { user } = start('/admin/usage', { account: admin, routes: { 'GET /admin/usage': () => json(stats) } })
    await screen.findByRole('heading', { name: 'Administration center - API usage' })
    expect(await screen.findByText('member@example.com')).toBeTruthy()
    await user.type(screen.getByLabelText('Filter endpoints'), 'improve')
    expect(screen.queryByText('/api/v1/questions')).toBeNull()
    expect(screen.getByText('/api/v1/ai/improve-question')).toBeTruthy()
  })

  it('lets administrators change a user level from the profile', async () => {
    const profile = { id: 2, handle: 'other', role: 'user', title: 'Registered user', created_at: now, blocked: false,
      points: 140, rank: 2, favorited: false, full_name: '', location: '', website: '', about: '',
      stats: { qposts: 1, aposts: 1, cposts: 0, aselects: 0, aselecteds: 0, qupvotes: 0, qdownvotes: 0, aupvotes: 0,
        adownvotes: 0, upvoteds: 0, downvoteds: 0 } }
    const update = vi.fn(() => json({ user: { ...profile, role: 'editor' } }))
    const { user } = start('/user/other', { account: admin, routes: {
      'GET /users/other': () => json({ user: profile }), 'PATCH /admin/users/2': update,
    } })
    await screen.findByRole('heading', { name: 'User other' })
    await user.selectOptions(screen.getByLabelText('User level:'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Save level' }))
    const typeRow = screen.getByRole('rowheader', { name: 'Type:' }).closest('tr')
    await waitFor(() => expect(within(typeRow).getByText('Editor')).toBeTruthy())
    expect(JSON.parse(update.mock.calls[0][0].body)).toEqual({ role: 'editor' })
  })
})
