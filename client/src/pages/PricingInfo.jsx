import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { DollarSign, Plus, Edit2, Save, X } from 'lucide-react'

const emptyRule = {
  vehicle_type: '',
  is_hazardous: false,
  base_price: '',
  price_per_kg: '',
}

export default function PricingInfo() {
  const [rules, setRules] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ ...emptyRule })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [r, s] = await Promise.all([
        api.get('/pricing'),
        api.get('/dashboard/stats').catch(() => null),
      ])
      setRules(r?.rules || r?.pricing || r?.pricing_rules || r?.data || [])
      setSummary(s)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (rule) => {
    setEditingId(rule.id)
    setEditForm({ ...rule })
  }

  const handleSaveEdit = async () => {
    try {
      await api.put(`/pricing/${editingId}`, editForm)
      setEditingId(null)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAdd = async () => {
    try {
      await api.post('/pricing', addForm)
      setShowAdd(false)
      setAddForm({ ...emptyRule })
      fetchData()
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
          <DollarSign size={24} />
          Pricing Information
        </h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Rule
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">New Pricing Rule</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Vehicle Type
              </label>
              <input
                type="text"
                value={addForm.vehicle_type}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, vehicle_type: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Base Price
              </label>
              <input
                type="number"
                value={addForm.base_price}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, base_price: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Price per kg
              </label>
              <input
                type="number"
                value={addForm.price_per_kg}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, price_per_kg: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={addForm.is_hazardous}
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, is_hazardous: e.target.checked }))
                  }
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Hazardous</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowAdd(false)
                setAddForm({ ...emptyRule })
              }}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pricing table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No pricing rules defined
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vehicle Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Hazardous
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Base Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Price/kg
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  {editingId === rule.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editForm.vehicle_type || ''}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              vehicle_type: e.target.value,
                            }))
                          }
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={editForm.is_hazardous || false}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              is_hazardous: e.target.checked,
                            }))
                          }
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={editForm.base_price || ''}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              base_price: e.target.value,
                            }))
                          }
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={editForm.price_per_kg || ''}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              price_per_kg: e.target.value,
                            }))
                          }
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={handleSaveEdit}
                            className="p-1.5 rounded hover:bg-green-50 text-green-600"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">
                        {rule.vehicle_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {rule.is_hazardous ? 'Yes' : 'No'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {rule.base_price != null ? `$${rule.base_price}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {rule.price_per_kg != null
                          ? `$${rule.price_per_kg}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleEdit(rule)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cost summary */}
      {summary && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Cost Summary
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(summary.byType || []).map((item) => (
              <div key={item.vehicle_type} className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">
                  {item.vehicle_type}
                </div>
                <div className="text-lg font-bold text-gray-800">
                  {item.count} dockets
                </div>
                <div className="text-sm text-green-600 font-medium">
                  ${item.total_cost?.toFixed(2) || '0.00'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
