import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import {
  FileText,
  CalendarDays,
  CalendarCheck,
  Clock,
  FileQuestion,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const statCards = [
  { key: 'totalAll', label: 'Total Dockets (All Time)', icon: FileText, color: 'bg-blue-500' },
  { key: 'totalPrevMonth', label: 'Total Dockets (Prev Month)', icon: CalendarDays, color: 'bg-indigo-500' },
  { key: 'totalCurrMonth', label: 'Total Dockets (This Month)', icon: CalendarCheck, color: 'bg-green-500' },
  { key: 'totalToday', label: "Today's Dockets", icon: Clock, color: 'bg-amber-500' },
  { key: 'pendingRequests', label: 'Pending Requests', icon: FileQuestion, color: 'bg-red-500' },
]

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [weeklyData, setWeeklyData] = useState([])
  const [hourlyData, setHourlyData] = useState([])
  const [teamActivity, setTeamActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function fetchAll() {
      try {
        const [s, w, h, t] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/weekly'),
          api.get('/dashboard/hourly'),
          api.get('/dashboard/team-activity'),
        ])
        setStats(s)
        setWeeklyData(Array.isArray(w) ? w : w?.weekly || w?.data || [])
        setHourlyData(Array.isArray(h) ? h : h?.hourly || h?.data || [])
        setTeamActivity(Array.isArray(t) ? t : t?.team || t?.data || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
    return () => controller.abort()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        Failed to load dashboard: {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div
            key={card.key}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`${card.color} p-2 rounded-lg`}>
                <card.icon size={18} className="text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-800">
              {stats?.[card.key] ?? 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Queue Tracker */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Weekly Queue Tracker</h2>
            <button className="text-xs text-blue-600 hover:underline">Date range</button>
          </div>
          <div style={{ width: '100%', height: 256, minWidth: 200 }}>
            <ResponsiveContainer width="100%" height={256}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Queue Tracker */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Hourly Queue Tracker</h2>
            <button className="text-xs text-blue-600 hover:underline">Hour range</button>
          </div>
          <div style={{ width: '100%', height: 256, minWidth: 200 }}>
            <ResponsiveContainer width="100%" height={256}>
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Team Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Team Activity Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {teamActivity.length === 0 ? (
            <p className="text-sm text-gray-400 col-span-full">No team data available</p>
          ) : (
            teamActivity.map((member) => (
              <div
                key={member.id || member.name}
                className="flex items-center gap-2 p-2 rounded-lg bg-gray-50"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    member.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm text-gray-700 truncate">{member.name}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Total counter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center">
        <div className="text-sm text-gray-500 mb-1">Total Dockets Processed</div>
        <div className="text-4xl font-bold text-blue-600">{stats?.totalAll ?? 0}</div>
      </div>
    </div>
  )
}
