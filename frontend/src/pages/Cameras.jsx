import { useEffect, useState } from 'react'
import { fetchCameras, createCamera, updateCamera, reconnectCamera, deleteCamera } from '../api'

const EMPTY = { name: '', location: '', rtsp_url: '', description: '' }

export default function Cameras({ user, notify }) {
  const [cameras,  setCameras]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)   // 'add' | 'edit' | false
  const [form,     setForm]     = useState(EMPTY)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [actionBusyById, setActionBusyById] = useState({})
  const isCaptain = user?.role === 'captain'

  async function load() {
    try {
      setCameras(await fetchCameras())
    } catch {
      notify('Failed to load cameras.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function getErrorDetail(err, fallback) {
    return err?.response?.data?.detail || fallback
  }

  function openAdd()      { setForm(EMPTY); setEditId(null); setModal('add') }
  function openEdit(cam)  { setForm({ name: cam.name, location: cam.location, rtsp_url: cam.rtsp_url,
    description: cam.description || '' });
    setEditId(cam.id); setModal('edit') }
  function closeModal()   { setModal(false); setEditId(null); setForm(EMPTY) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal === 'add') {
        await createCamera(form)
        notify('Camera added.', 'success')
      } else {
        await updateCamera(editId, form)
        notify('Camera updated.', 'success')
      }
      closeModal()
      load()
    } catch (err) {
      notify(getErrorDetail(err, 'Failed to save camera.'), 'error')
    } finally { setSaving(false) }
  }

  async function runRowAction(cameraId, work) {
    setActionBusyById(prev => ({ ...prev, [cameraId]: true }))
    try {
      await work()
    } finally {
      setActionBusyById(prev => {
        const next = { ...prev }
        delete next[cameraId]
        return next
      })
    }
  }

  async function handleDisable(camera) {
    if (!confirm(`Disable ${camera.name}?`)) return

    await runRowAction(camera.id, async () => {
      try {
        await updateCamera(camera.id, { status: 'inactive' })
        notify('Camera disabled.', 'success')
        await load()
      } catch (err) {
        notify(getErrorDetail(err, 'Failed to disable camera.'), 'error')
      }
    })
  }

  async function handleReconnect(camera) {
    await runRowAction(camera.id, async () => {
      try {
        await reconnectCamera(camera.id)
        notify('Camera reconnected and enabled.', 'success')
        await load()
      } catch (err) {
        notify(getErrorDetail(err, 'Failed to reconnect camera.'), 'error')
      }
    })
  }

  async function handleDelete(id) {
    if (!confirm('Delete this camera?')) return
    try {
      await deleteCamera(id)
      notify('Camera deleted.', 'success')
      load()
    } catch {
      notify('Failed to delete camera.', 'error')
    }
  }

  const statusColor = {
    active:      'bg-green-100 text-green-800',
    inactive:    'bg-gray-100 text-gray-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    failed:      'bg-red-100 text-red-800',
    error:       'bg-red-100 text-red-800',
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Camera Management</h3>
          {isCaptain && (
            <button onClick={openAdd}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">
              <i className="fas fa-plus mr-2" />Add Camera
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <i className="fas fa-spinner fa-spin text-emerald-500 text-2xl" />
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <i className="fas fa-video text-4xl mb-3 block text-gray-300" />
            No cameras configured yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {cameras.map(cam => (
              <div key={cam.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-video text-green-600 text-xl" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{cam.name}</h4>
                    <p className="text-sm text-gray-600">{cam.location}</p>
                    <p className="text-xs text-gray-400">
                      Stream source: {cam.rtsp_url ? 'Configured (private)' : 'Not configured'}
                    </p>
                    {cam.status === 'failed' && cam.last_stream_error && (
                      <p className="text-xs text-red-600 mt-1">{cam.last_stream_error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor[cam.status] || 'bg-gray-100 text-gray-600'}`}>
                    {cam.status}
                  </span>
                  {isCaptain && (
                    <>
                      {cam.status === 'active' && (
                        <button
                          onClick={() => handleDisable(cam)}
                          disabled={!!actionBusyById[cam.id]}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded text-xs disabled:opacity-50"
                        >
                          Disable
                        </button>
                      )}
                      {(cam.status === 'inactive' || cam.status === 'failed' || cam.status === 'error') && (
                        <button
                          onClick={() => handleReconnect(cam)}
                          disabled={!!actionBusyById[cam.id]}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs disabled:opacity-50"
                        >
                          {cam.status === 'inactive' ? 'Enable' : 'Reconnect'}
                        </button>
                      )}
                      <button onClick={() => openEdit(cam)}
                        disabled={!!actionBusyById[cam.id]}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs disabled:opacity-50">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(cam.id)}
                        disabled={!!actionBusyById[cam.id]}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs disabled:opacity-50">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{modal === 'add' ? 'Add Camera' : 'Edit Camera'}</h3>
              <button onClick={closeModal}><i className="fas fa-times text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {[
                { label: 'Camera Name',  key: 'name',        type: 'text',   req: true  },
                { label: 'Location',     key: 'location',    type: 'text',   req: true  },
                { label: 'RTSP URL',     key: 'rtsp_url',    type: 'text',   req: true  },
                { label: 'Description',  key: 'description', type: 'text',   req: false },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} required={f.req} value={form[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              ))}
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
