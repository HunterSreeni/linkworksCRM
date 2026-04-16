import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { PackageCheck, AlertTriangle, Flag, Search } from 'lucide-react'

export default function OutputTracker() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await api.get('/requests?status=replied,closed,delivery_failed')
        setRequests(res?.requests || res?.data || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filtered = requests.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.docket_number || '').toLowerCase().includes(q) ||
      (r.customer_ref_number || '').toLowerCase().includes(q) ||
      (r.collection_address || '').toLowerCase().includes(q) ||
      (r.delivery_address || '').toLowerCase().includes(q) ||
      (r.inbound_email?.subject || '').toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <PackageCheck size={24} />
        Output Tracker
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by docket, reference, address, subject..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No replied requests
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Docket #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Customer Ref
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Collection
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Delivery
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vehicle
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Confirmation Sent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Delivery Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-gray-50 cursor-pointer ${r.is_priority ? 'bg-red-50/50' : ''}`}
                  onClick={() => navigate(`/requests/${r.id}`)}
                >
                  <td className="px-4 py-3">
                    {r.is_priority && <Flag size={14} className="text-red-500" />}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">
                    {r.docket_number || r.inbound_email?.subject?.slice(0, 20) || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {r.customer_ref_number || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate">
                    {r.collection_address || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate">
                    {r.delivery_address || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.vehicle || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {r.updated_at
                      ? new Date(r.updated_at).toLocaleString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'delivery_failed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium bg-red-100 text-red-700">
                        <AlertTriangle size={12} />
                        Failed
                      </span>
                    ) : r.status === 'closed' ? (
                      <span className="inline-block px-2 py-1 text-xs rounded-full font-medium bg-green-100 text-green-700">
                        Delivered
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 text-xs rounded-full font-medium bg-blue-100 text-blue-700">
                        Replied
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
