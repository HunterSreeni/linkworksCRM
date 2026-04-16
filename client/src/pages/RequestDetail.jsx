import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Send,
  Download,
  Mail,
  X,
  Flag,
} from 'lucide-react'

const VEHICLE_OPTIONS = [
  { value: '', label: 'Select vehicle type...' },
  { value: 'standard', label: 'Standard' },
  { value: 'tailift', label: 'Tail Lift' },
  { value: 'oog', label: 'Out of Gauge (OOG)' },
  { value: 'curtain_side', label: 'Curtain Side' },
]

const WEIGHT_UNITS = ['kg', 'tonnes']
const DIMENSION_UNITS = ['cm', 'm', 'mm']

const fields = [
  { key: 'collection_address', label: 'Collection Address' },
  { key: 'delivery_address', label: 'Delivery Address' },
  { key: 'collection_datetime', label: 'Collection Date/Time', type: 'datetime-local' },
  { key: 'delivery_datetime', label: 'Delivery Date/Time', type: 'datetime-local' },
  { key: 'is_hazardous', label: 'Hazardous', type: 'checkbox' },
  { key: 'weight', label: 'Weight', type: 'unit', units: WEIGHT_UNITS, unitKey: 'weight_unit' },
  { key: 'dimensions', label: 'Dimensions', type: 'unit', units: DIMENSION_UNITS, unitKey: 'dimensions_unit' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'vehicle', label: 'Vehicle Type', type: 'vehicle-select' },
  { key: 'customer_ref_number', label: 'Customer Ref #' },
  { key: 'account_code', label: 'Account Code' },
  { key: 'docket_number', label: 'Docket Number' },
]

function formatDatetimeLocal(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

function formatDateReadable(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const VEHICLE_DISPLAY = {
  standard: 'Standard',
  tailift: 'Tail Lift',
  oog: 'Out of Gauge (OOG)',
  curtain_side: 'Curtain Side',
}

const statusFlow = {
  draft: ['confirmed'],
  confirmed: ['processing'],
  processing: ['replied'],
  replied: ['closed'],
}

function ConfidenceIcon({ level }) {
  if (level === 'extracted' || level === 'high') return <CheckCircle size={14} className="text-green-500" />
  if (level === 'uncertain' || level === 'medium') return <AlertTriangle size={14} className="text-yellow-500" />
  return <XCircle size={14} className="text-red-500" />
}

export default function RequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [formData, setFormData] = useState({})
  const [emails, setEmails] = useState([])
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [auditLog, setAuditLog] = useState([])
  const [showReplyModal, setShowReplyModal] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [replyPreview, setReplyPreview] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [res, audit] = await Promise.all([
          api.get(`/requests/${id}`),
          api.get(`/audit?entity_id=${id}`).catch(() => ({ data: [] })),
        ])
        const requestData = res?.request || res
        setRequest(requestData)
        setFormData(requestData)
        setEmails(res?.emails || [])
        setAttachments(res?.attachments || [])
        const auditData = audit?.audit || audit?.data || []
        setAuditLog(Array.isArray(auditData) ? auditData : [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleAttachmentDownload = async (att) => {
    try {
      const res = await api.get(`/attachments/${att.id}/download`)
      if (res?.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer')
      } else {
        setError('No download URL returned')
      }
    } catch (err) {
      setError(err.message || 'Could not download attachment')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.patch(`/requests/${id}`, formData)
      const updated = res?.request || res
      setRequest(updated)
      setFormData(updated)
      setSuccess('Changes saved')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await api.patch(`/requests/${id}/status`, {
        status: newStatus,
      })
      const updated = res?.request || res
      setRequest(updated)
      setFormData(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  const openReplyModal = async () => {
    try {
      const res = await api.get('/templates')
      setTemplates(res?.templates || res?.data || [])
      setShowReplyModal(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const selectTemplate = (template) => {
    setSelectedTemplate(template)
    let preview = template.body_template || ''
    const weightDisplay = formData.weight
      ? `${formData.weight} ${formData.weight_unit || 'kg'}`
      : '___'
    const dimensionsDisplay = formData.dimensions
      ? `${formData.dimensions} ${formData.dimensions_unit || 'cm'}`
      : '___'
    preview = preview.replace(/\{\{docket_number\}\}/g, formData.docket_number || '___')
    preview = preview.replace(/\{\{customer_ref\}\}/g, formData.customer_ref_number || '___')
    preview = preview.replace(/\{\{account_code\}\}/g, formData.account_code || '___')
    preview = preview.replace(/\{\{collection_address\}\}/g, formData.collection_address || '___')
    preview = preview.replace(/\{\{collection_date\}\}/g, formatDateReadable(formData.collection_datetime) || '___')
    preview = preview.replace(/\{\{delivery_address\}\}/g, formData.delivery_address || '___')
    preview = preview.replace(/\{\{delivery_date\}\}/g, formatDateReadable(formData.delivery_datetime) || '___')
    preview = preview.replace(/\{\{vehicle_type\}\}/g, VEHICLE_DISPLAY[formData.vehicle] || formData.vehicle || '___')
    preview = preview.replace(/\{\{hazardous\}\}/g, formData.is_hazardous ? 'Yes' : 'No')
    preview = preview.replace(/\{\{weight\}\}/g, weightDisplay)
    preview = preview.replace(/\{\{dimensions\}\}/g, dimensionsDisplay)
    setReplyPreview(preview)
  }

  const sendReply = async () => {
    setSending(true)
    try {
      await api.post('/reply', {
        request_id: id,
        template_id: selectedTemplate.id,
        body: replyPreview,
      })
      setShowReplyModal(false)
      setSelectedTemplate(null)
      setReplyPreview('')
      const refetched = await api.get(`/requests/${id}`)
      const updatedReq = refetched?.request || refetched
      setRequest(updatedReq)
      setFormData(updatedReq)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="text-center py-12 text-gray-400">Request not found</div>
    )
  }

  const nextStatuses = statusFlow[request.status] || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">
            Request {request.docket_number || `#${id.slice(0, 8)}`}
          </h1>
          <span
            className={`px-3 py-1 text-xs rounded-full font-medium ${
              request.status === 'draft'
                ? 'bg-gray-200 text-gray-700'
                : request.status === 'confirmed'
                ? 'bg-blue-100 text-blue-700'
                : request.status === 'processing'
                ? 'bg-yellow-100 text-yellow-700'
                : request.status === 'replied'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {request.status}
          </span>
          {request.is_priority && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium bg-red-100 text-red-700">
              <Flag size={10} />
              Priority
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 capitalize"
            >
              Move to {s}
            </button>
          ))}
          {request.status === 'processing' && (
            <button
              onClick={openReplyModal}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Send size={14} />
              Reply with Template
            </button>
          )}
        </div>
      </div>

      {/* Bounce/delivery alert - driven by request.status enum, not a separate column */}
      {request.status === 'delivery_failed' && (
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={18} />
          <span className="font-medium">Delivery Failed</span> - The confirmation
          email could not be delivered. Please check the recipient address and resend.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left - Email content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 mb-1">
              <Mail size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">
                Original Email
              </span>
            </div>
            <div className="text-xs text-gray-500 space-y-0.5 mt-2">
              <div>
                <span className="font-medium">Subject:</span>{' '}
                {emails[0]?.subject || '-'}
              </div>
              <div>
                <span className="font-medium">From:</span>{' '}
                {emails[0]?.from_address || '-'}
              </div>
              <div>
                <span className="font-medium">To:</span>{' '}
                {emails[0]?.to_address || '-'}
              </div>
              <div>
                <span className="font-medium">Received:</span>{' '}
                {emails[0]?.received_at
                  ? new Date(emails[0].received_at).toLocaleString()
                  : '-'}
              </div>
            </div>
          </div>
          <div className="p-5 max-h-[600px] overflow-y-auto">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {emails[0]?.body_clean || emails[0]?.body_raw || 'No email content available'}
            </pre>
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
              <div className="text-xs font-medium text-gray-500 mb-2">
                Attachments
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAttachmentDownload(att)}
                    disabled={!att.storage_path}
                    title={att.storage_path
                      ? `Download ${att.filename}`
                      : 'File content was not captured (received before storage was enabled)'}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={12} />
                    {att.filename || `Attachment ${i + 1}`}
                    {att.file_size ? (
                      <span className="text-gray-400 ml-1">
                        ({(att.file_size / 1024).toFixed(0)} KB)
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right - Extracted data form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              Extracted Data
            </span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
            {/* Priority toggle */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Flag size={14} className={formData.is_priority ? 'text-red-500' : 'text-gray-400'} />
                <span className="text-xs font-medium text-gray-600">High Priority</span>
              </div>
              <button
                type="button"
                onClick={() => handleChange('is_priority', !formData.is_priority)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.is_priority ? 'bg-red-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.is_priority ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {fields.map((field) => (
              <div key={field.key}>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">
                    {field.label}
                  </label>
                  <ConfidenceIcon
                    level={request[`${field.key}_confidence`] || request.confidence?.[field.key] || 'missing'}
                  />
                </div>
                {field.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData[field.key] || false}
                      onChange={(e) =>
                        handleChange(field.key, e.target.checked)
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Yes</span>
                  </label>
                ) : field.type === 'vehicle-select' ? (
                  <select
                    value={formData[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {VEHICLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : field.type === 'unit' ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData[field.key] ?? ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                    <select
                      value={formData[field.unitKey] || field.units[0]}
                      onChange={(e) => handleChange(field.unitKey, e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[80px]"
                    >
                      {field.units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                ) : field.type === 'datetime-local' ? (
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={formatDatetimeLocal(formData[field.key])}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {formData[field.key] && (
                      <button
                        type="button"
                        onClick={() => handleChange(field.key, null)}
                        className="px-2 py-2 text-gray-400 hover:text-red-500"
                        title="Clear date"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ) : field.type === 'number' ? (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData[field.key] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1)
                      handleChange(field.key, val)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <input
                    type="text"
                    value={formData[field.key] ?? ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit history */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">
            Audit History
          </span>
        </div>
        {auditLog.length === 0 ? (
          <div className="p-5 text-sm text-gray-400 text-center">
            No audit entries yet
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {auditLog.map((entry, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700">{entry.action}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {entry.user_name || 'System'} -{' '}
                    {entry.created_at
                      ? new Date(entry.created_at).toLocaleString()
                      : ''}
                  </div>
                  {entry.details && (
                    <div className="text-xs text-gray-500 mt-1">
                      {entry.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {showReplyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Reply with Template
              </h3>
              <button
                onClick={() => {
                  setShowReplyModal(false)
                  setSelectedTemplate(null)
                  setReplyPreview('')
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Template selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Template
                </label>
                <div className="space-y-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className={`w-full text-left px-4 py-3 rounded-lg border text-sm ${
                        selectedTemplate?.id === t.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-gray-800">{t.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t.subject_template}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {selectedTemplate && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Preview
                  </label>
                  <textarea
                    value={replyPreview}
                    onChange={(e) => setReplyPreview(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowReplyModal(false)
                  setSelectedTemplate(null)
                  setReplyPreview('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendReply}
                disabled={!selectedTemplate || sending}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                ) : (
                  <Send size={14} />
                )}
                {sending ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
