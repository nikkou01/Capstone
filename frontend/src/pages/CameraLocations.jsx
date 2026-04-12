import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createCamera, fetchCameras, updateCamera } from '../api'

const DEFAULT_CENTER = [14.5995, 120.9842]

const PINNED_CAMERA_ICON = L.divIcon({
  className: 'camera-map-pin camera-map-pin--pinned',
  html: '<span class="camera-map-pin__glyph"><i class="fas fa-video"></i></span>',
  iconSize: [34, 46],
  iconAnchor: [17, 44],
  popupAnchor: [0, -36],
  tooltipAnchor: [0, -32],
})

const DRAFT_CAMERA_ICON = L.divIcon({
  className: 'camera-map-pin camera-map-pin--draft',
  html: '<span class="camera-map-pin__glyph"><i class="fas fa-map-marker-alt"></i></span>',
  iconSize: [34, 46],
  iconAnchor: [17, 44],
  popupAnchor: [0, -36],
  tooltipAnchor: [0, -32],
})

function MapClickSelector({ enabled, onSelect }) {
  useMapEvents({
    click(e) {
      if (!enabled) return
      onSelect(e.latlng)
    },
  })
  return null
}

function RecenterMap({ center }) {
  const map = useMap()

  useEffect(() => {
    if (!center) return
    map.flyTo(center, Math.max(map.getZoom(), 13), { duration: 0.6 })
  }, [center, map])

  return null
}

export default function CameraLocations({ user, notify }) {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [draftPoint, setDraftPoint] = useState(null)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [mode, setMode] = useState('view')

  const isCaptain = user?.role === 'captain'

  async function load() {
    try {
      const rows = await fetchCameras()
      setCameras(rows)
      if (rows.length === 0) {
        setSelectedCameraId('')
      } else if (!rows.some(c => c.id === selectedCameraId)) {
        setSelectedCameraId(rows[0].id)
      }
    } catch {
      notify('Failed to load camera locations.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pinnedCameras = useMemo(
    () => cameras.filter(c => Number.isFinite(c.map_latitude) && Number.isFinite(c.map_longitude)),
    [cameras],
  )

  const selectedCamera = useMemo(
    () => cameras.find(c => c.id === selectedCameraId) || null,
    [cameras, selectedCameraId],
  )

  const mapCenter = useMemo(() => {
    if (draftPoint) return [draftPoint.lat, draftPoint.lng]
    if (selectedCamera && Number.isFinite(selectedCamera.map_latitude) && Number.isFinite(selectedCamera.map_longitude)) {
      return [selectedCamera.map_latitude, selectedCamera.map_longitude]
    }
    if (pinnedCameras.length > 0) {
      return [pinnedCameras[0].map_latitude, pinnedCameras[0].map_longitude]
    }
    return DEFAULT_CENTER
  }, [draftPoint, selectedCamera, pinnedCameras])

  async function handleSavePin() {
    if (!selectedCameraId || !draftPoint) {
      notify('Select a camera and click a map position first.', 'error')
      return
    }

    setSaving(true)
    try {
      await updateCamera(selectedCameraId, {
        map_latitude: Number(draftPoint.lat.toFixed(6)),
        map_longitude: Number(draftPoint.lng.toFixed(6)),
      })
      notify('Camera pinpoint saved.', 'success')
      setDraftPoint(null)
      await load()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Failed to save camera pinpoint.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSeedCamera() {
    setSeeding(true)
    try {
      const suffix = String(Date.now()).slice(-6)
      const created = await createCamera({
        name: `Test Camera ${suffix}`,
        location: 'Test Zone',
        rtsp_url: `rtsp://127.0.0.1:8554/test-${suffix}`,
        description: 'Seeded test camera for map pinpoint assignment',
      })

      await load()
      setSelectedCameraId(created.id)
      notify('Test camera created. Click on the map and save its pinpoint.', 'success')
    } catch (err) {
      notify(err?.response?.data?.detail || 'Failed to create test camera.', 'error')
    } finally {
      setSeeding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="fas fa-spinner fa-spin text-emerald-500 text-3xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Camera Location Map</h3>
          <p className="text-sm text-gray-600 mt-1">
            {mode === 'view'
              ? 'View all CCTV pinpoints on the map.'
              : 'Choose a camera, click the map, and save its pinpoint.'}
          </p>
        </div>

        {isCaptain && (
          mode === 'view' ? (
            <button
              onClick={() => setMode('assign')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
            >
              <i className="fas fa-map-marker-alt mr-2" />Assign Camera
            </button>
          ) : (
            <button
              onClick={() => {
                setMode('view')
                setDraftPoint(null)
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <i className="fas fa-arrow-left mr-2" />Back to Map View
            </button>
          )
        )}
      </div>

      {mode === 'assign' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Assign Camera Pinpoint</h3>
              <p className="text-sm text-gray-600 mt-1">
                Choose a camera, then click the map to set its exact location.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Camera</label>
              <select
                value={selectedCameraId}
                onChange={e => {
                  setSelectedCameraId(e.target.value)
                  setDraftPoint(null)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {cameras.length === 0 && <option value="">No cameras available</option>}
                {cameras.map(cam => (
                  <option key={cam.id} value={cam.id}>{cam.name} - {cam.location}</option>
                ))}
              </select>
            </div>

            {cameras.length === 0 && isCaptain && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p>No cameras yet. Create a test camera first, then assign its pinpoint on the map.</p>
                <button
                  onClick={handleSeedCamera}
                  disabled={seeding}
                  className="mt-3 w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {seeding ? 'Creating test camera…' : 'Seed Test Camera'}
                </button>
              </div>
            )}

            {selectedCamera && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <p className="font-medium text-gray-900">{selectedCamera.name}</p>
                <p className="text-gray-600">{selectedCamera.location}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Current pin: {Number.isFinite(selectedCamera.map_latitude) && Number.isFinite(selectedCamera.map_longitude)
                    ? `${selectedCamera.map_latitude.toFixed(6)}, ${selectedCamera.map_longitude.toFixed(6)}`
                    : 'Not assigned'}
                </p>
              </div>
            )}

            {draftPoint && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-medium">Pending pinpoint</p>
                <p>Lat: {draftPoint.lat.toFixed(6)}</p>
                <p>Lng: {draftPoint.lng.toFixed(6)}</p>
              </div>
            )}

            {isCaptain ? (
              <div className="flex gap-3">
                <button
                  onClick={handleSavePin}
                  disabled={!selectedCameraId || !draftPoint || saving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Pinpoint'}
                </button>
                <button
                  onClick={() => setDraftPoint(null)}
                  disabled={!draftPoint || saving}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                You have view-only access. A captain account can assign or update pinpoints.
              </div>
            )}
          </div>

          <div className="xl:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Camera Location Map</h3>
              <span className="text-xs text-gray-500">Pinned cameras: {pinnedCameras.length}</span>
            </div>
            <div className="h-[560px]">
              <MapContainer center={mapCenter} zoom={13} scrollWheelZoom className="h-full w-full">
                <RecenterMap center={mapCenter} />
                <MapClickSelector
                  enabled={isCaptain && Boolean(selectedCameraId)}
                  onSelect={point => setDraftPoint(point)}
                />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {pinnedCameras.map(cam => (
                  <Marker key={cam.id} position={[cam.map_latitude, cam.map_longitude]} icon={PINNED_CAMERA_ICON}>
                    <Tooltip permanent direction="top" offset={[0, -10]}>{cam.name}</Tooltip>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold text-gray-900">{cam.name}</p>
                        <p className="text-gray-600">{cam.location}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {cam.map_latitude.toFixed(6)}, {cam.map_longitude.toFixed(6)}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {draftPoint && selectedCamera && (
                  <Marker position={[draftPoint.lat, draftPoint.lng]} opacity={0.9} icon={DRAFT_CAMERA_ICON}>
                    <Tooltip permanent direction="top" offset={[0, -10]}>
                      {selectedCamera.name} (draft)
                    </Tooltip>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold text-gray-900">Draft pin for {selectedCamera.name}</p>
                        <p className="text-gray-600">Click Save Pinpoint to persist.</p>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Assigned CCTV Locations</h3>
            <span className="text-xs text-gray-500">Pinned cameras: {pinnedCameras.length}</span>
          </div>
          <div className="h-[620px]">
            <MapContainer center={mapCenter} zoom={13} scrollWheelZoom className="h-full w-full">
              <RecenterMap center={mapCenter} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {pinnedCameras.map(cam => (
                <Marker key={cam.id} position={[cam.map_latitude, cam.map_longitude]} icon={PINNED_CAMERA_ICON}>
                  <Tooltip permanent direction="top" offset={[0, -10]}>{cam.name}</Tooltip>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold text-gray-900">{cam.name}</p>
                      <p className="text-gray-600">{cam.location}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {cam.map_latitude.toFixed(6)}, {cam.map_longitude.toFixed(6)}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Assigned Camera Locations</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {pinnedCameras.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-500">No camera pinpoints assigned yet.</p>
          ) : (
            pinnedCameras.map(cam => (
              <div key={cam.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-gray-900">{cam.name}</p>
                  <p className="text-sm text-gray-600">{cam.location}</p>
                </div>
                <p className="text-sm text-gray-500">
                  {cam.map_latitude.toFixed(6)}, {cam.map_longitude.toFixed(6)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
