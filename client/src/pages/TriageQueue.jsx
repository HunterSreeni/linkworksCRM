import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { AlertCircle, Tag, MessageSquare, Trash2, Inbox } from 'lucide-react'

export default function TriageQueue() {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    fetchEmails()
  }, [])

  async function fetchEmails() {
    try {
      setLoading(true)
      const res = await api.get('/emails?classification=unclassified,query')
      setEmails(res?.emails || res?.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(emailId, action) {
    setActionLoading(emailId)
    try {
      await api.post(`/emails/${emailId}/classify`, { classification: action })
      setEmails((prev) => prev.filter((e) => e.id !== emailId))
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(null)
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
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <AlertCircle size={24} />
        Triage Queue
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {emails.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Inbox size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">No emails in triage queue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <div
              key={email.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Header */}
              <div
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                onClick={() =>
                  setExpandedId(expandedId === email.id ? null : email.id)
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                        email.classification === 'unclassified'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {email.classification}
                    </span>
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {email.subject || 'No subject'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    From: {email.from_address || '-'} - {' '}
                    {email.received_at
                      ? new Date(email.received_at).toLocaleString()
                      : ''}
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-2 ml-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleAction(email.id, 'booking')}
                    disabled={actionLoading === email.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    title="Create booking request"
                  >
                    <Tag size={12} />
                    Booking
                  </button>
                  <button
                    onClick={() => handleAction(email.id, 'query')}
                    disabled={actionLoading === email.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    title="Mark as query"
                  >
                    <MessageSquare size={12} />
                    Query
                  </button>
                  <button
                    onClick={() => handleAction(email.id, 'noise')}
                    disabled={actionLoading === email.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
                    title="Mark as noise"
                  >
                    <Trash2 size={12} />
                    Noise
                  </button>
                </div>
              </div>

              {/* Expanded content */}
              {expandedId === email.id && (
                <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {email.body || 'No content available'}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
