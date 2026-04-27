import { useState } from 'react'
import { fetchUsers, createUser, updateUser, deleteUser } from '../api'
import useAutoRefresh from '../utils/useAutoRefresh'

const EMPTY = { username: '', email: '', full_name: '', role: 'responder', phone_number: '', password: '' }

export default function Users({ user: currentUser, notify }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY)
  const [editId,  setEditId]  = useState(null)
  const [saving,  setSaving]  = useState(false)

  async function load(options = {}) {
    const background = !!options.background
    try {
      setUsers(await fetchUsers())
    } catch {
      if (!background) notify('Failed to load users.', 'error')
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 6000 })

  function openAdd()     { setForm(EMPTY); setEditId(null); setModal('add') }
  function openEdit(u)   { setForm({ username: u.username, email: u.email, full_name: u.full_name,
    role: u.role, phone_number: u.phone_number, password: '' });
    setEditId(u.id); setModal('edit') }
  function closeModal()  { setModal(false); setEditId(null); setForm(EMPTY) }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true)
    try {
      if (modal === 'add') {
        await createUser(form)
        notify('User created.', 'success')
      } else {
        const payload = { ...form }
        if (!payload.password) delete payload.password
        await updateUser(editId, payload)
        notify('User updated.', 'success')
      }
      closeModal(); load()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Failed to save user.', 'error')
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this user?')) return
    try {
      await deleteUser(id)
      notify('User deleted.', 'success')
      load()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Failed to delete user.', 'error')
    }
  }

  function initials(name) {
    return (name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">User Management</h3>
          <button onClick={openAdd}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">
            <i className="fas fa-plus mr-2" />Add User
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <i className="fas fa-spinner fa-spin text-emerald-500 text-2xl" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No users yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{initials(u.full_name)}</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{u.full_name}</h4>
                    <p className="text-sm text-gray-500">{u.email}</p>
                    <p className="text-xs text-gray-400">{u.phone_number}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium
                    ${u.role === 'captain' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                    {u.role}
                  </span>
                  <span className={`text-xs font-medium flex items-center space-x-1
                    ${u.is_active ? 'text-green-600' : 'text-red-500'}`}>
                    <i className={`fas fa-circle text-xs`} />
                    <span>{u.is_active ? 'Active' : 'Inactive'}</span>
                  </span>
                  <button onClick={() => openEdit(u)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs">
                    Edit
                  </button>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => handleDelete(u.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs">
                      Delete
                    </button>
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{modal === 'add' ? 'Add User' : 'Edit User'}</h3>
              <button onClick={closeModal}><i className="fas fa-times text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {[
                { label: 'Full Name',     key: 'full_name',    type: 'text',     req: true                          },
                { label: 'Username',      key: 'username',     type: 'text',     req: modal === 'add'               },
                { label: 'Email',         key: 'email',        type: 'email',    req: true                          },
                { label: 'Phone Number',  key: 'phone_number', type: 'tel',      req: true                          },
                { label: modal === 'add' ? 'Password' : 'New Password (leave blank to keep)',
                                          key: 'password',     type: 'password', req: modal === 'add'               },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} required={f.req} value={form[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="responder">Responder</option>
                  <option value="captain">Captain</option>
                </select>
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm">Cancel</button>
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
