import { useState } from 'react'
import { Activity, Users } from 'lucide-react'
import { admin, getUsage } from '../services/api'
import { useResource } from '../hooks/useResource'
import { DateValue, EmptyState, Notice, PageHeading, Resource } from '../components/ui'
import messages from '../../../lang/message/en/messages.json'

const formatCount = (count) => count.toLocaleString()

function Table({ label, columns, rows, empty = messages.analytics.empty }) {
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
  return <Table label={messages.analytics.requestsByEndpoint}
    columns={[messages.analytics.method, messages.analytics.endpoint, messages.analytics.requests, ...(showErrors ? [messages.analytics.errors] : [])]}
    rows={rows.map((row) => [
      `${row.method} ${row.endpoint}`, <span className="pill">{row.method}</span>,
      <code>{row.endpoint}</code>, formatCount(row.count),
      ...(showErrors ? [Number.isSafeInteger(row.errorCount) && row.errorCount >= 0 ? formatCount(row.errorCount) : messages.common.unavailable] : []),
    ])} />
}

export function UsagePage() {
  const resource = useResource(getUsage)
  return <>
    <PageHeading title={messages.layout.usage} description={messages.analytics.usageDescription} />
    <section className="panel padded">
      <h2>{messages.analytics.accountUsage}</h2>
      <Resource state={resource} label={messages.analytics.usageResource}>{(usage) => {
        if (!usage) return <EmptyState icon={Activity} title={messages.analytics.usageUnavailable}>
          {messages.analytics.noticeExplanation}
        </EmptyState>
        const remaining = Math.max(0, usage.threshold - usage.total)
        return <>
          <dl className="metrics">
            <div><dt>{messages.analytics.eligibleCalls}</dt><dd>{formatCount(usage.total)}</dd></div>
            <div><dt>{messages.analytics.threshold}</dt><dd>{formatCount(usage.threshold)}</dd></div>
            <div><dt>{messages.analytics.callsBeforeNotice}</dt><dd>{formatCount(remaining)}</dd></div>
          </dl>
          <progress aria-label={messages.analytics.progress} value={Math.min(usage.total, usage.threshold)}
            max={usage.threshold} />
          {remaining === 0 && <Notice>{messages.analytics.thresholdReached}</Notice>}
        </>
      }}</Resource>
    </section>
    {resource.data?.breakdown && <section className="panel analytics-block">
      <h2>{messages.analytics.breakdown}</h2><EndpointTable rows={resource.data.breakdown} />
    </section>}
    <p className="fine-print">{messages.analytics.excluded}</p>
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
    <PageHeading title={messages.layout.admin} description={messages.analytics.adminDescription} />
    <section className="panel analytics-block">
      <h2 className="with-icon"><Users size={19} aria-hidden="true" /> {messages.analytics.registeredUsers}</h2>
      <Resource state={counts} label={messages.analytics.totalsResource}>{(data) => <dl className="metrics compact">
        <div><dt>{messages.analytics.members}</dt><dd>{formatCount(data.users)}</dd></div>
        <div><dt>{messages.analytics.administrators}</dt><dd>{formatCount(data.admins)}</dd></div>
      </dl>}</Resource>
      <Resource state={users} label={messages.analytics.usersResource}>{(data) => {
        if (!data) return <p className="table-empty">{messages.analytics.directoryUnavailable}</p>
        const rows = data.users.filter((user) => match(user.email, query) && (role === 'all' || user.role === role))
        return <>
          <div className="table-filters">
            <label className="field">{messages.analytics.filterByEmail}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="field">{messages.common.role}<select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">{messages.analytics.allRoles}</option><option value="user">{messages.common.member}</option><option value="admin">{messages.common.admin}</option>
            </select></label>
          </div>
          <Table label={messages.analytics.registeredUsers} columns={[messages.common.email, messages.common.role, messages.common.created, messages.analytics.eligibleCalls]}
            empty={data.users.length ? messages.analytics.noMatchingAccounts : messages.analytics.noAccounts}
            rows={rows.map((user) => [user.id, user.email, user.role === 'admin' ? messages.common.admin : messages.common.member,
              <DateValue value={user.created_at} />, user.api_calls == null ? messages.common.unavailable : formatCount(user.api_calls)])} />
        </>
      }}</Resource>
    </section>
    <Resource state={usage} label={messages.analytics.adminUsageResource}>{(data) => <>
      <section className="panel analytics-block">
        <h2>{messages.analytics.usageByUser}</h2>
        {data ? <Table label={messages.analytics.usageByUser} columns={[messages.common.email, messages.analytics.eligibleCalls]}
          rows={data.byUser.map((row) => [row.user_id, row.email, formatCount(row.count)])} />
          : <p className="table-empty">{messages.analytics.perUserUnavailable}</p>}
      </section>
      <section className="panel analytics-block">
        <h2>{messages.analytics.usageByEndpoint}</h2>
        {data ? <>
          <div className="table-filters"><label className="field">{messages.analytics.filterEndpoints}
            <input type="search" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
          </label></div>
          <EndpointTable rows={data.byEndpoint.filter((row) => match(`${row.method} ${row.endpoint}`, endpoint))} />
        </> : <p className="table-empty">{messages.analytics.endpointUsageUnavailable}</p>}
      </section>
    </>}</Resource>
  </>
}
