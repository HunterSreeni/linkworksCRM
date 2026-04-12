import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Shield, Clock, CheckCircle, TrendingUp } from 'lucide-react'

export default function Quality() {
  const [data, setData] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchData() {
      try {
        const [stats, res] = await Promise.all([
          api.get('/dashboard/stats').catch(() => ({})),
          api.get('/requests?status=closed&limit=20'),
        ])
        setData(stats)
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
        <Shield size={24} />
        Quality Overview
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-green-500 p-2 rounded-lg">
              <CheckCircle size={18} className="text-white" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {data?.totalClosed ?? 0}
          </div>
          <div className="text-xs text-gray-500 mt-1">Total Closed</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Clock size={18} className="text-white" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {data?.avgProcessingTime ?? '-'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Avg Processing Time</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-amber-500 p-2 rounded-lg">
              <TrendingUp size={18} className="text-white" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {data?.deliverySuccessRate ?? '-'}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Delivery Success Rate</div>
        </div>
      </div>

      {/* Recent closures */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Recent Closures</h2>
        </div>
        {requests.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No closed requests yet
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
                  Closed At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Processing Time
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
                    {r.closed_at
                      ? new Date(r.closed_at).toLocaleString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {r.processing_time || '-'}
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
