import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const owner = { id: 1, email: 'owner@example.com', role: 'user' }
const admin = { id: 2, email: 'admin@example.com', role: 'admin' }
const otherUser = { id: 3, email: 'reader@example.com', role: 'user' }
const visible = {
  id: 10, user_id: owner.id, title: 'A visible question', body: 'Some visible details.',
  hidden: false, last_edited_by: null,
}
const hidden = {
  ...visible, id: 11, title: 'A hidden question', body: 'Some hidden details.',
  hidden: true, last_edited_by: owner.id,
}
const adminHidden = { ...hidden, last_edited_by: admin.id }

const json = (data, status = 200) => Response.json(data, { status })

function open(path, user, responses = {}) {
  const routes = {
    'GET /auth/me': () => json({ user }),
    'GET /questions': () => json({ questions: [visible] }),
    ...responses,
  }
  const requests = vi.fn((url, options) => {
    const endpoint = new URL(url, window.location.origin).pathname.replace(/^\/api\/v1/, '')
    return routes[`${options.method} ${endpoint}`]?.() ?? json({ message: 'Unexpected request' }, 404)
  })
  vi.stubGlobal('fetch', requests)
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  const calls = (method, endpoint) => requests.mock.calls.filter(([url, options]) =>
    options.method === method && url.endsWith(`/api/v1${endpoint}`))
  return { actor: userEvent.setup(), calls }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // JSDOM omits the native dialog methods.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
    this.querySelector('button').focus()
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  cleanup()
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('question moderation', () => {
  it('returns an owner to the visible list after hiding a question', async () => {
    const { actor, calls } = open('/questions/10', owner, {
      'GET /questions/10': () => json({ question: visible }),
      'POST /questions/10/hide': () => new Response(null, { status: 204 }),
      'GET /questions': () => json({ questions: [] }),
    })

    await actor.click(await screen.findByRole('button', { name: 'Hide Question' }))
    expect(await screen.findByText('Question hidden.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'My Questions' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: visible.title })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hidden' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reshow Question' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Edit question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Permanently' })).toBeNull()

    expect(await screen.findByRole('heading', { name: 'No questions yet' })).toBeTruthy()
    expect(calls('POST', '/questions/10/hide')).toHaveLength(1)
    expect(calls('POST', '/questions/10/reshow')).toHaveLength(0)
    expect(calls('GET', '/questions')).toHaveLength(1)
  })

  it('lets administrators hide and reshow questions from other users', async () => {
    const { actor, calls } = open('/questions/10', admin, {
      'GET /questions/10': () => json({ question: visible }),
      'POST /questions/10/hide': () => json({ question: { ...visible, hidden: true, last_edited_by: admin.id } }),
      'POST /questions/10/reshow': () => json({ question: { ...visible, last_edited_by: admin.id } }),
    })

    const hide = await screen.findByRole('button', { name: 'Hide Question' })
    expect(screen.queryByRole('button', { name: 'Delete Permanently' })).toBeNull()
    await actor.click(hide)
    expect(await screen.findByRole('button', { name: 'Reshow Question' })).toBeTruthy()
    expect(screen.getByText('Hidden')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit question' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete Permanently' })).toBeTruthy()
    expect(calls('POST', '/questions/10/hide')).toHaveLength(1)
    await actor.click(screen.getByRole('button', { name: 'Reshow Question' }))
    expect(await screen.findByText('Question reshown.')).toBeTruthy()
    expect(screen.queryByText('Hidden')).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit question' }).getAttribute('href')).toBe('/questions/10/edit')
    expect(screen.queryByRole('button', { name: 'Delete Permanently' })).toBeNull()
    expect(calls('POST', '/questions/10/reshow')).toHaveLength(1)
  })

  it('keeps moderation controls away from regular readers', async () => {
    open('/questions/10', otherUser, { 'GET /questions/10': () => json({ question: visible }) })
    await screen.findByRole('heading', { name: visible.title })
    expect(screen.queryByRole('button', { name: 'Hide Question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Permanently' })).toBeNull()
  })

  it('redirects a hidden question edit URL to the administrator detail view', async () => {
    open('/questions/11/edit', admin, { 'GET /questions/11': () => json({ question: adminHidden }) })
    await screen.findByRole('heading', { name: hidden.title })
    expect(screen.getByText('Hidden')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save Question' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Edit question' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reshow Question' })).toBeTruthy()
  })

  it.each([
    ['an owner opening the detail URL', owner, '/questions/11'],
    ['an owner opening the edit URL', owner, '/questions/11/edit'],
    ['a reader opening the detail URL', otherUser, '/questions/11'],
  ])('blocks hidden content for %s', async (_label, user, path) => {
    const { calls } = open(path, user, {
      'GET /questions/11': () => json({ message: 'This question is hidden.' }, 403),
    })
    expect((await screen.findByRole('alert')).textContent).toContain('This question is hidden.')
    expect(screen.queryByText(hidden.title)).toBeNull()
    expect(screen.queryByText(hidden.body)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save Question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reshow Question' })).toBeNull()
    expect(calls('GET', '/questions/11')).toHaveLength(1)
  })

  it('disables a pending hide request and leaves the question unchanged on error', async () => {
    let finishHide
    const { actor, calls } = open('/questions/10', owner, {
      'GET /questions/10': () => json({ question: visible }),
      'POST /questions/10/hide': () => new Promise((resolve) => { finishHide = resolve }),
    })

    const hide = await screen.findByRole('button', { name: 'Hide Question' })
    await actor.click(hide)
    expect(hide.disabled).toBe(true)
    await actor.click(hide)
    expect(calls('POST', '/questions/10/hide')).toHaveLength(1)
    finishHide(json({ message: 'Could not hide the question.' }, 409))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not hide the question.')
    expect(hide.disabled).toBe(false)
    expect(screen.queryByText('Hidden')).toBeNull()
  })

  it('confirms permanent deletion, handles a failed attempt, and redirects after a successful retry', async () => {
    let finishDelete
    const remove = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { finishDelete = resolve }))
      .mockReturnValueOnce(new Response(null, { status: 204 }))
    const { actor } = open('/questions/11', admin, {
      'GET /questions/11': () => json({ question: hidden }),
      'DELETE /questions/11': remove,
    })

    const trigger = await screen.findByRole('button', { name: 'Delete Permanently' })
    await actor.click(trigger)
    const confirm = screen.getByRole('dialog', { name: 'Permanently delete this question?' })
    expect(within(confirm).getByText(/cannot be undone/i)).toBeTruthy()
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))
    await actor.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(remove).not.toHaveBeenCalled()

    await actor.click(trigger)
    await actor.click(within(confirm).getByRole('button', { name: 'Delete Permanently' }))
    expect(within(confirm).getByRole('button', { name: 'Deleting…' }).disabled).toBe(true)
    expect(within(confirm).getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    expect(fireEvent(confirm, new Event('cancel', { cancelable: true }))).toBe(false)
    expect(remove).toHaveBeenCalledTimes(1)

    finishDelete(json({}, 503))
    expect((await within(confirm).findByRole('alert')).textContent).toBe('The service is temporarily unavailable. Please try again.')
    await actor.click(within(confirm).getByRole('button', { name: 'Delete Permanently' }))
    expect(await screen.findByText('Question permanently deleted.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'My Questions' })).toBeTruthy()
    expect(remove).toHaveBeenCalledTimes(2)
  })
})

describe('question list filters', () => {
  it('lets administrators search the hidden list and open a hidden question', async () => {
    const another = { ...hidden, id: 12, title: 'Another question', body: 'Different content.' }
    const { actor, calls } = open('/questions', admin, {
      'GET /questions/hidden': () => json({ questions: [hidden, another] }),
      'GET /questions/11': () => json({ question: hidden }),
    })

    await screen.findByRole('link', { name: visible.title })
    expect(screen.getByRole('button', { name: 'All visible' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Owned by me' })).toBeTruthy()
    expect(calls('GET', '/questions/hidden')).toHaveLength(0)
    await actor.click(screen.getByRole('button', { name: 'Hidden' }))
    const match = await screen.findByRole('link', { name: hidden.title })
    expect(within(match.closest('li')).getByText('Hidden')).toBeTruthy()
    expect(screen.getByRole('link', { name: another.title })).toBeTruthy()
    expect(screen.queryByRole('link', { name: visible.title })).toBeNull()
    await actor.type(screen.getByRole('searchbox'), 'hidden details')
    expect(screen.queryByRole('link', { name: another.title })).toBeNull()
    await actor.click(match)
    expect(await screen.findByRole('heading', { name: hidden.title })).toBeTruthy()
    expect(calls('GET', '/questions/hidden')).toHaveLength(1)
  })

  it('keeps both visible filters available for a regular user without fetching hidden questions', async () => {
    const shared = { ...visible, id: 12, user_id: admin.id, title: 'Another visible question' }
    const { actor, calls } = open('/questions', owner, {
      'GET /questions': () => json({ questions: [visible, shared] }),
    })

    await screen.findByRole('link', { name: shared.title })
    expect(screen.queryByRole('button', { name: 'Hidden' })).toBeNull()
    await actor.click(screen.getByRole('button', { name: 'Owned by me' }))
    expect(screen.getByRole('link', { name: visible.title })).toBeTruthy()
    expect(screen.queryByRole('link', { name: shared.title })).toBeNull()
    await actor.click(screen.getByRole('button', { name: 'All visible' }))
    expect(screen.getByRole('link', { name: shared.title })).toBeTruthy()
    expect(calls('GET', '/questions/hidden')).toHaveLength(0)
  })
})
