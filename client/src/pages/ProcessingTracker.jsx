import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Settings, Search } from 'lucide-react'

export default function ProcessingTracker() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await api.get('/requests?status=confirmed,processing')
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
      (r.delivery_address || '').toLowerCase().includes(q)
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
        <Settings size={24} />
        Processing Tracker
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
          placeholder="Search by docket, reference, address..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No requests in processing
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
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
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vehicle
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Assigned To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/requests/${r.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">
                    {r.docket_number || '-'}
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
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {r.collection_datetime
                      ? new Date(r.collection_datetime).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.vehicle_type || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.assigned_to_name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${
                        r.status === 'processing'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {r.status}
                    </span>
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
