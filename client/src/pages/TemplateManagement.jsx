import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { FileText, Plus, Save, X, Eye } from 'lucide-react'

const placeholders = [
  '{{docket_number}}',
  '{{customer_ref_number}}',
  '{{collection_address}}',
  '{{delivery_address}}',
  '{{collection_datetime}}',
  '{{delivery_datetime}}',
  '{{vehicle_type}}',
  '{{weight}}',
  '{{quantity}}',
]

const sampleData = {
  docket_number: 'DKT-20260412-001',
  customer_ref_number: 'CR-9876',
  collection_address: '123 Warehouse Rd, London EC1A 1BB',
  delivery_address: '456 High Street, Manchester M1 1AA',
  collection_datetime: '2026-04-12 09:00',
  delivery_datetime: '2026-04-12 17:00',
  vehicle_type: 'HGV',
  weight: '2500',
  quantity: '10',
}

export default function TemplateManagement() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    subject_template: '',
    body_template: '',
  })
  const [showAdd, setShowAdd] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewContent, setPreviewContent] = useState('')

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    try {
      const res = await api.get('/templates')
      setTemplates(res?.templates || res?.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (template) => {
    setEditingId(template.id)
    setEditForm({
      name: template.name,
      subject_template: template.subject_template,
      body_template: template.body_template,
    })
  }

  const handleSave = async () => {
    try {
      if (editingId === 'new') {
        await api.post('/templates', editForm)
      } else {
        await api.put('/templates', { ...editForm, id: editingId })
      }
      setEditingId(null)
      setShowAdd(false)
      fetchTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  const handlePreview = (body) => {
    let preview = body
    Object.entries(sampleData).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    })
    setPreviewContent(preview)
    setShowPreview(true)
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
          <FileText size={24} />
          Template Management
        </h1>
        <button
          onClick={() => {
            setShowAdd(true)
            setEditingId('new')
            setEditForm({ name: '', subject_template: '', body_template: '' })
          }}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          New Template
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Available placeholders */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="text-xs font-medium text-blue-700 mb-2">
          Available Placeholders
        </div>
        <div className="flex flex-wrap gap-2">
          {placeholders.map((p) => (
            <code
              key={p}
              className="px-2 py-1 bg-white rounded text-xs text-blue-600 border border-blue-200"
            >
              {p}
            </code>
          ))}
        </div>
      </div>

      {/* Editor */}
      {(editingId || showAdd) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">
            {editingId === 'new' ? 'New Template' : 'Edit Template'}
          </h3>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, name: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Booking Confirmation"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Subject Template
            </label>
            <input
              type="text"
              value={editForm.subject_template}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, subject_template: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Booking Confirmed - {{docket_number}}"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Body Template
            </label>
            <textarea
              value={editForm.body_template}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, body_template: e.target.value }))
              }
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="Dear Customer, your booking {{docket_number}} has been confirmed..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Save size={14} />
              Save
            </button>
            <button
              onClick={() => handlePreview(editForm.body_template)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
            >
              <Eye size={14} />
              Preview
            </button>
            <button
              onClick={() => {
                setEditingId(null)
                setShowAdd(false)
              }}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="space-y-3">
        {templates.length === 0 && !showAdd ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
            No templates yet. Create one to get started.
          </div>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-800">
                  {t.name}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePreview(t.body_template)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => handleEdit(t)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Edit
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                Subject: {t.subject_template}
              </div>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                {t.body_template}
              </pre>
            </div>
          ))
        )}
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Template Preview (Sample Data)
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {previewContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
