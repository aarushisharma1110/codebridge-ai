import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const member = { id: 1, email: 'member@example.com', role: 'user', created_at: '2026-01-10T12:00:00Z' }
const admin = { ...member, role: 'admin' }
const own = { id: 8, user_id: 1, title: 'How do I handle errors?', body: 'I am using React.' }
const shared = { ...own, id: 9, user_id: 2, title: 'How do I use PostgreSQL?' }
const suggestion = 'How can I handle request errors in React?'
const improveRoute = 'POST /ai/improve-question'

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})
const unauthenticated = () => json({ message: 'Authentication required' }, 401)

function start(path, { account = member, routes = {} } = {}) {
  const fetch = vi.fn(async (url, options) => {
    const pathname = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '')
    const key = options.method + ' ' + pathname
    if (key in routes) return routes[key](options)
    if (key === 'GET /auth/me') return account ? json({ user: account }) : unauthenticated()
    if (key === 'GET /questions') return json({ questions: [own, shared] })
    if (key === 'GET /questions/8') return json({ question: own })
    if (key === 'GET /questions/9') return json({ question: shared })
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  return { fetch, user: userEvent.setup() }
}

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('session and authorization', () => {
  it('protects deep links and returns there after login', async () => {
    const { user, fetch } = start('/questions/8', {
      account: null, routes: { 'POST /auth/login': () => json({ user: member }) },
    })
    await screen.findByRole('heading', { name: 'Welcome back' })
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Enter your email address.')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(1)
    await user.type(screen.getByLabelText('Email address'), member.email)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'abc')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password', { exact: true }).type).toBe('text')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByRole('heading', { name: own.title })
    expect(fetch.mock.calls.every(([, options]) => options.credentials === 'include')).toBe(true)
  })

  it('validates registration, shows a duplicate error, and redirects after success', async () => {
    const register = vi.fn().mockImplementationOnce(() => json({ message: 'Email already registered' }, 409))
      .mockImplementationOnce(() => json({ user: member }, 201))
    const { user } = start('/register', { account: null, routes: { 'POST /auth/register': register } })
    await screen.findByRole('heading', { name: 'Create an account' })
    await user.type(screen.getByLabelText('Email address'), member.email)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'short')
    const confirm = screen.getByLabelText('Confirm password')
    await user.type(confirm, 'different')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy()
    expect(screen.getByText('Passwords must match.')).toBeTruthy()
    expect(register).not.toHaveBeenCalled()
    const password = screen.getByLabelText('Password', { exact: true })
    await user.clear(password)
    await user.type(password, 'a passphrase')
    await user.clear(confirm)
    await user.type(confirm, 'a passphrase')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Email already registered')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Account created. Log in to get started.')).toBeTruthy()
  })

  it('restores a member session and blocks the admin route and API requests', async () => {
    const { fetch } = start('/admin')
    await screen.findByRole('heading', { name: 'Administrator access required' })
    expect(screen.queryByRole('link', { name: 'Administration' })).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shows administrator navigation, real totals, and unavailable analytics', async () => {
    start('/admin', { account: admin, routes: { 'GET /admin/dashboard': () => json({ users: 12, admins: 2 }) } })
    await screen.findByRole('heading', { name: 'Administration' })
    expect(screen.getByRole('link', { name: 'Administration' })).toBeTruthy()
    expect(await screen.findByText('12')).toBeTruthy()
    expect(await screen.findByText('The registered-user directory is unavailable.')).toBeTruthy()
    expect(await screen.findByText('Endpoint usage data is unavailable.')).toBeTruthy()
  })

  it('prompts for a new login when a protected request receives 401', async () => {
    start('/questions', { routes: { 'GET /questions': unauthenticated } })
    expect(await screen.findByText('Your session ended. Log in to continue.')).toBeTruthy()
  })
})

describe('question workflows', () => {
  it('labels ownership and supports text search and owned-only filtering', async () => {
    const { user } = start('/questions')
    expect(await screen.findByText('Yours')).toBeTruthy()
    expect(screen.getByText('Shared')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Owned by me' }))
    expect(screen.queryByRole('link', { name: shared.title })).toBeNull()
    await user.type(screen.getByRole('searchbox'), 'no matches')
    expect(screen.getByRole('heading', { name: 'No matching questions' })).toBeTruthy()
  })

  it('shows a genuine empty state', async () => {
    start('/questions', { routes: { 'GET /questions': () => json({ questions: [] }) } })
    expect(await screen.findByRole('heading', { name: 'No questions yet' })).toBeTruthy()
  })

  it('validates a new question, preserves a failed draft, and retries the save', async () => {
    const create = vi.fn().mockImplementationOnce(() => json({}, 500))
      .mockImplementationOnce(() => json({ question: own }, 201))
    const { user } = start('/questions/new', { routes: { 'POST /questions': create } })
    await screen.findByRole('heading', { name: 'New Question' })
    const save = screen.getByRole('button', { name: 'Save Question' })
    await user.click(save)
    expect(screen.getByText('Enter a question title.')).toBeTruthy()
    const title = screen.getByLabelText('Question title')
    await user.type(title, own.title)
    await user.type(screen.getByLabelText(/question details/i), own.body)
    await user.click(save)
    expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable')
    expect(title.value).toBe(own.title)
    await user.click(save)
    expect(await screen.findByText('Question created.')).toBeTruthy()
    expect(JSON.parse(create.mock.calls[1][0].body)).toEqual({ title: own.title, body: own.body })
  })

  it('restores the unsaved draft after the same user logs in again', async () => {
    const { user } = start('/questions/new', { routes: {
      'POST /questions': unauthenticated,
      'POST /auth/login': () => json({ user: member }),
    } })
    await screen.findByRole('heading', { name: 'New Question' })
    await user.type(screen.getByLabelText('Question title'), own.title)
    await user.click(screen.getByRole('button', { name: 'Save Question' }))
    await screen.findByText('Your session ended. Log in to continue.')
    await user.type(screen.getByLabelText('Email address'), member.email)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'a passphrase')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByRole('heading', { name: 'New Question' })
    expect(screen.getByLabelText('Question title').value).toBe(own.title)
  })

  it('lets admins update shared questions without offering deletion', async () => {
    const update = vi.fn(() => json({ question: shared }))
    const { user } = start('/questions/9/edit', { account: admin, routes: { 'PATCH /questions/9': update } })
    await screen.findByRole('heading', { name: 'Edit question' })
    expect(screen.queryByRole('button', { name: 'Delete Question' })).toBeNull()
    const title = screen.getByLabelText('Question title')
    await user.type(title, ' Please help.')
    await user.click(screen.getByRole('button', { name: 'Save Question' }))
    expect(await screen.findByText('Question updated.')).toBeTruthy()
    expect(JSON.parse(update.mock.calls[0][0].body).title).toBe(shared.title + ' Please help.')
  })

  it('redirects a member away from the edit route for another owner’s question', async () => {
    start('/questions/9/edit')
    await screen.findByRole('heading', { name: shared.title })
    expect(screen.queryByRole('link', { name: 'Edit question' })).toBeNull()
  })

  it('requires explicit delete confirmation and supports cancel', async () => {
    const remove = vi.fn(() => new Response(null, { status: 204 }))
    const { user } = start('/questions/8/edit', { routes: { 'DELETE /questions/8': remove } })
    await screen.findByRole('heading', { name: 'Edit question' })
    const element = document.querySelector('dialog')
    element.showModal = () => { element.open = true }
    element.close = () => { element.open = false }
    const trigger = screen.getByRole('button', { name: 'Delete Question', exact: true })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog')
    expect(remove).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(trigger)
    await user.click(within(dialog).getByRole('button', { name: 'Delete question', exact: true }))
    expect(await screen.findByText('Question deleted.')).toBeTruthy()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})

describe('assistant and usage', () => {
  it('shows pending AI feedback, recovers from rate limiting, and keeps the original', async () => {
    let complete
    const improve = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
      .mockImplementationOnce(() => json({ improvedQuestion: suggestion }))
    const { user } = start('/questions/8/edit', { routes: { [improveRoute]: improve } })
    await screen.findByRole('heading', { name: 'Edit question' })
    const title = screen.getByLabelText('Question title')
    await user.click(screen.getByRole('button', { name: 'Improve with AI' }))
    expect(screen.getByText('Preparing a wording suggestion…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Question' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Improving…' }).disabled).toBe(true)
    expect(improve).toHaveBeenCalledTimes(1)
    expect(JSON.parse(improve.mock.calls[0][0].body)).toEqual({ question: own.title })
    expect(improve.mock.calls[0][0].credentials).toBe('include')
    await act(async () => complete(json({}, 429)))
    expect((await screen.findByRole('alert')).textContent).toContain('Too many requests')
    expect(title.value).toBe(own.title)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(suggestion)).toBeTruthy()
    expect(title.value).toBe(own.title)
    await user.click(screen.getByRole('button', { name: 'Keep original' }))
    expect(title.value).toBe(own.title)
    expect(screen.queryByText(suggestion)).toBeNull()
  })

  it('passes the accepted suggestion to the correct editor without saving it', async () => {
    const { user, fetch } = start('/assistant', { routes: { [improveRoute]: () => json({ improvedQuestion: suggestion }) } })
    const select = await screen.findByLabelText('Start from an existing question')
    await user.selectOptions(select, '8')
    await user.click(screen.getByRole('button', { name: 'Improve with AI' }))
    const accept = await screen.findByRole('button', { name: 'Accept suggestion' })
    expect(screen.getByLabelText('Question title').value).toBe(own.title)
    await user.click(accept)
    await user.click(screen.getByRole('link', { name: 'Continue to editor' }))
    await screen.findByRole('heading', { name: 'Edit question' })
    expect(screen.getByLabelText('Question title').value).toBe(suggestion)
    expect(screen.getByLabelText(/question details/i).value).toBe(own.body)
    expect(fetch.mock.calls.filter(([, options]) => options.method !== 'GET')).toHaveLength(1)
  })

  it('shows unavailable AI without fabricating a suggestion', async () => {
    const { user } = start('/questions/8/edit', { routes: { [improveRoute]: () => json({}, 503) } })
    await screen.findByRole('heading', { name: 'Edit question' })
    await user.click(screen.getByRole('button', { name: 'Improve with AI' }))
    expect(await screen.findByText(/AI improvement is temporarily unavailable/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
  })

  it.each([
    ['times out', () => json({}, 504), 'AI took too long to respond.'],
    ['returns invalid output upstream', () => json({}, 502), 'AI returned an invalid or incomplete suggestion.'],
    ['returns invalid data', () => json({ improvedQuestion: 42 }), 'The server returned an unexpected response.'],
  ])('preserves the original when AI %s', async (_case, response, message) => {
    const { user } = start('/questions/8/edit', { routes: { [improveRoute]: response } })
    await screen.findByRole('heading', { name: 'Edit question' })
    await user.click(screen.getByRole('button', { name: 'Improve with AI' }))
    expect((await screen.findByRole('alert')).textContent).toContain(message)
    expect(screen.getByLabelText('Question title').value).toBe(own.title)
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
  })

  it('accepts a short draft for AI and puts a long rewrite above the existing details on acceptance', async () => {
    const longSuggestion = 'What could be the reason my React state is failing to refresh the component, and how can I check whether the state update reached the component?'
    const { user, fetch } = start('/questions/new', { routes: {
      [improveRoute]: () => json({ improvedQuestion: longSuggestion }),
    } })
    await screen.findByRole('heading', { name: 'New Question' })
    const improve = screen.getByRole('button', { name: 'Improve with AI' })
    await user.click(improve)
    expect(screen.getByText('Enter a question title.')).toBeTruthy()
    const title = screen.getByLabelText('Question title')
    const details = screen.getByLabelText(/question details/i)
    await user.type(title, 'react state')
    await user.type(details, own.body)
    await user.click(improve)
    await screen.findByText(longSuggestion)
    expect(title.value).toBe('react state')
    expect(details.value).toBe(own.body)
    await user.click(screen.getByRole('button', { name: 'Accept suggestion' }))
    expect(details.value).toBe(longSuggestion + '\n\n' + own.body)
    expect(fetch.mock.calls.filter(([, options]) => options.method !== 'GET')).toHaveLength(1)
  })

  it('caps progress and shows a non-blocking notice above the threshold', async () => {
    start('/usage', { routes: { 'GET /usage': () => json({ total: 24, threshold: 20 }) } })
    const progress = await screen.findByRole('progressbar')
    expect(progress.value).toBe(20)
    expect(screen.getByText('24')).toBeTruthy()
    expect(screen.getByText('You’ve reached the usage notice threshold. You can continue using the API.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'My Questions' })).toBeTruthy()
  })

  it('offers a retry on a usage failure and avoids inventing counts', async () => {
    const usage = vi.fn().mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
      .mockImplementationOnce(() => json({}, 404))
    const { user } = start('/usage', { routes: { 'GET /usage': usage } })
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Usage data is unavailable' })
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
  })
})
