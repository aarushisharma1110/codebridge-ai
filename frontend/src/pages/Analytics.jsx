import { useState } from 'react'
import { Activity, Users } from 'lucide-react'
import { admin, getUsage } from '../services/api'
import { useResource } from '../hooks/useResource'
import { DateValue, EmptyState, Notice, PageHeading, Resource } from '../components/ui'

const formatCount = (count) => count.toLocaleString()

function Table({ label, columns, rows, empty = 'No records yet.' }) {
  if (!rows.length) return <p className="table-empty">{empty}</p>
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
    <table aria-label={label}>
      <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{rows.map(([id, ...cells]) => <tr key={id}>
        {cells.map((cell, index) => <td key={columns[index]}>{cell}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
}

function EndpointTable({ rows }) {
  const showErrors = rows.some((row) => Number.isSafeInteger(row.errorCount) && row.errorCount >= 0)
  return <Table label="API requests by endpoint"
    columns={['Method', 'Endpoint', 'Requests', ...(showErrors ? ['Errors'] : [])]}
    rows={rows.map((row) => [
      `${row.method} ${row.endpoint}`, <span className="pill">{row.method}</span>,
      <code>{row.endpoint}</code>, formatCount(row.count),
      ...(showErrors ? [Number.isSafeInteger(row.errorCount) && row.errorCount >= 0 ? formatCount(row.errorCount) : 'Unavailable'] : []),
    ])} />
}

export function UsagePage() {
  const resource = useResource(getUsage)
  return <>
    <PageHeading title="API Usage" description="Review your account’s eligible API requests and usage notice threshold." />
    <section className="panel padded">
      <h2>Account usage</h2>
      <Resource state={resource} label="API usage">{(usage) => {
        if (!usage) return <EmptyState icon={Activity} title="Usage data is unavailable">
          The usage notice is set for 20 eligible calls. Requests can continue after the notice.
        </EmptyState>
        const remaining = Math.max(0, usage.threshold - usage.total)
        return <>
          <dl className="metrics">
            <div><dt>Eligible calls</dt><dd>{formatCount(usage.total)}</dd></div>
            <div><dt>Notice threshold</dt><dd>{formatCount(usage.threshold)}</dd></div>
            <div><dt>Calls before notice</dt><dd>{formatCount(remaining)}</dd></div>
          </dl>
          <progress aria-label="Progress toward the usage notice" value={Math.min(usage.total, usage.threshold)}
            max={usage.threshold} />
          {remaining === 0 && <Notice>You’ve reached the usage notice threshold. You can continue using the API.</Notice>}
        </>
      }}</Resource>
    </section>
    {resource.data?.breakdown && <section className="panel analytics-block">
      <h2>Usage breakdown</h2><EndpointTable rows={resource.data.breakdown} />
    </section>}
    <p className="fine-print">Registration, login, logout, documentation, and CORS preflight requests are excluded.</p>
  </>
}

export function AdminPage() {
  const counts = useResource(admin.counts)
  const users = useResource(admin.users)
  const usage = useResource(admin.usage)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('all')
  const [endpoint, setEndpoint] = useState('')
  const match = (value, filter) => value.toLowerCase().includes(filter.trim().toLowerCase())

  return <>
    <PageHeading title="Administration" description="Review registered accounts and API activity." />
    <section className="panel analytics-block">
      <h2 className="with-icon"><Users size={19} aria-hidden="true" /> Registered users</h2>
      <Resource state={counts} label="account totals">{(data) => <dl className="metrics compact">
        <div><dt>Members</dt><dd>{formatCount(data.users)}</dd></div>
        <div><dt>Administrators</dt><dd>{formatCount(data.admins)}</dd></div>
      </dl>}</Resource>
      <Resource state={users} label="registered users">{(data) => {
        if (!data) return <p className="table-empty">The registered-user directory is unavailable.</p>
        const rows = data.users.filter((user) => match(user.email, query) && (role === 'all' || user.role === role))
        return <>
          <div className="table-filters">
            <label className="field">Filter by email<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="field">Role<select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">All roles</option><option value="user">Member</option><option value="admin">Administrator</option>
            </select></label>
          </div>
          <Table label="Registered users" columns={['Email', 'Role', 'Created', 'Eligible calls']}
            empty={data.users.length ? 'No accounts match your filters.' : 'No accounts yet.'}
            rows={rows.map((user) => [user.id, user.email, user.role === 'admin' ? 'Administrator' : 'Member',
              <DateValue value={user.created_at} />, user.api_calls == null ? 'Unavailable' : formatCount(user.api_calls)])} />
        </>
      }}</Resource>
    </section>
    <Resource state={usage} label="administrator usage statistics">{(data) => <>
      <section className="panel analytics-block">
        <h2>Usage by user</h2>
        {data ? <Table label="Usage by user" columns={['Email', 'Eligible calls']}
          rows={data.byUser.map((row) => [row.user_id, row.email, formatCount(row.count)])} />
          : <p className="table-empty">Per-user usage data is unavailable.</p>}
      </section>
      <section className="panel analytics-block">
        <h2>Usage by endpoint</h2>
        {data ? <>
          <div className="table-filters"><label className="field">Filter endpoints
            <input type="search" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
          </label></div>
          <EndpointTable rows={data.byEndpoint.filter((row) => match(`${row.method} ${row.endpoint}`, endpoint))} />
        </> : <p className="table-empty">Endpoint usage data is unavailable.</p>}
      </section>
    </>}</Resource>
  </>
}
