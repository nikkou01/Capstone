export function parseApiDate(value) {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw)
  const normalized = hasTimezone ? raw : `${raw}Z`
  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) return null
  return date
}

export function formatApiDateTime(value) {
  const date = parseApiDate(value)
  if (!date) return 'N/A'
  return date.toLocaleString()
}
