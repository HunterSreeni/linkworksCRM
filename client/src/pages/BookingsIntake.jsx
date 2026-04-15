import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Inbox, Users, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 25

export default function BookingsIntake() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [teamMembers, setTeamMembers] = useState([])
  const [assignTo, setAssignTo] = useState('')
  const [polling, setPolling] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const navigate = useNavigate()
  const { user } = useAuth()

  async function fetchData(pageNum = page) {
    try {
      setLoading(true)
      const [res, team] = await Promise.all([
        api.get(`/requests?status=draft&page=${pageNum}&limit=${PAGE_SIZE}`),
        api.get('/users').catch(() => ({ users: [] })),
      ])
      setRequests(res?.requests || res?.data || [])
      setTeamMembers(team?.users || team?.data || [])
      setTotalPages(res?.pagination?.pages || 1)
      setTotalCount(res?.pagination?.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(page)
  }, [page])

  async function handlePoll() {
    setPolling(true)
    setError('')
    try {
      await api.post('/emails/poll', {})
      // Reset to page 1 so newly polled emails are visible at the top.
      if (page !== 1) {
        setPage(1)
      } else {
        await fetchData(1)
      }
    } catch (err) {
      setError(err.message || 'Poll failed')
    } finally {
      setPolling(false)
    }
  }

  const filtered = requests.filter((r) => {
    if (filter === 'unassigned') return !r.assigned_to
    if (filter === 'mine') return r.assigned_to === user?.id
    return true
  })

  const toggleSelect = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((r) => r.id)))
    }
  }

  const handleBulkAssign = async () => {
    if (!assignTo || selected.size === 0) return
    try {
      const ids = Array.from(selected)
      await Promise.all(
        ids.map((reqId) =>
          api.patch(`/requests/${reqId}/assign`, { assigned_to: assignTo })
        )
      )
      setRequests((prev) =>
        prev.map((r) =>
          selected.has(r.id) ? { ...r, assigned_to: assignTo } : r
        )
      )
      setSelected(new Set())
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Inbox size={24} />
          Bookings Intake
        </h1>
        <button
          onClick={handlePoll}
          disabled={polling}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          title="Fetch new emails from inbox now"
        >
          <RefreshCw size={14} className={polling ? 'animate-spin' : ''} />
          {polling ? 'Polling...' : 'Refresh inbox'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Filters and bulk actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
          {['all', 'unassigned', 'mine'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'mine' ? 'Assigned to Me' : f}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Assign to...</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!assignTo}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Assign ({selected.size})
            </button>
          </div>
        )}
      </div>

      {/* Request list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No draft requests found
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Subject
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  From
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Received
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Assigned
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((req) => (
                <tr
                  key={req.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/requests/${req.id}`)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(req.id)}
                      onChange={() => toggleSelect(req.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">
                    {req.inbound_email?.subject || 'No subject'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {req.inbound_email?.from_address || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {req.inbound_email?.received_at
                      ? new Date(req.inbound_email.received_at).toLocaleString()
                      : req.created_at
                      ? new Date(req.created_at).toLocaleString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {req.assigned_profile?.full_name || req.assigned_profile?.email || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm">
            <div className="text-gray-500">
              Page {page} of {totalPages} - {totalCount} total
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
