import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { PackageCheck, AlertTriangle } from 'lucide-react'

export default function OutputTracker() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await api.get('/requests?status=replied')
        setRequests(res?.requests || res?.data || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No replied requests
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
                  Confirmation Sent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Delivery Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
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
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {r.updated_at
                      ? new Date(r.updated_at).toLocaleString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'delivery_failed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium bg-red-100 text-red-700">
                        <AlertTriangle size={12} />
                        Delivery Failed
                      </span>
                    ) : r.status === 'closed' ? (
                      <span className="inline-block px-2 py-1 text-xs rounded-full font-medium bg-green-100 text-green-700">
                        Delivered
                      </span>
                    ) : r.status === 'replied' ? (
                      <span className="inline-block px-2 py-1 text-xs rounded-full font-medium bg-blue-100 text-blue-700">
                        Replied
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 text-xs rounded-full font-medium bg-gray-100 text-gray-600">
                        {r.status || 'Pending'}
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
