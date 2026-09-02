import { formatAccumulatedTime, getGamificationData } from './gamification.js'

const CSV_SEPARATOR = ';'

function pad(value) {
  return String(value).padStart(2, '0')
}

export function localDateKey(value = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('La date du fichier est invalide.')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function localDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${localDateKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function collectLocalStorage(storage = localStorage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key) => typeof key === 'string')
    .sort((left, right) => left.localeCompare(right))

  return Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]))
}

export function buildLocalStorageBackup({
  storage = localStorage,
  now = new Date(),
  origin = window.location.origin,
} = {}) {
  const storedData = collectLocalStorage(storage)
  return {
    application: 'JCPMF',
    formatVersion: 1,
    exportedAt: new Date(now).toISOString(),
    origin,
    itemCount: Object.keys(storedData).length,
    localStorage: storedData,
  }
}

export function escapeCsvCell(value, separator = CSV_SEPARATOR) {
  const text = value == null ? '' : String(value)
  if (text.includes(separator) || text.includes('"') || /[\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function decimalForCsv(value) {
  const number = Number(value)
  return Number.isFinite(number) ? String(number).replace('.', ',') : ''
}

export function completedSessionsToCsv(completions = []) {
  const columns = [
    ['Date', (session) => localDateTime(session.completedAt)],
    ['Séance', (session) => session.title || 'Séance'],
    ["Durée d'effort", (session) => formatAccumulatedTime(session.durationSeconds)],
    ['Distance (km)', (session) => decimalForCsv(session.distanceKm)],
    ['Pas', (session) => Math.max(0, Math.round(Number(session.stepsCount) || 0))],
  ]
  const rows = [...completions]
    .sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt))
    .map((session) => columns.map(([, read]) => escapeCsvCell(read(session))).join(CSV_SEPARATOR))

  return [columns.map(([label]) => escapeCsvCell(label)).join(CSV_SEPARATOR), ...rows].join('\r\n')
}

export function downloadBlob(blob, filename, {
  documentRef = document,
  urlApi = URL,
} = {}) {
  const objectUrl = urlApi.createObjectURL(blob)
  const link = documentRef.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.hidden = true
  documentRef.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => urlApi.revokeObjectURL(objectUrl), 1000)
  return filename
}

export function exportCompletedSessionsCsv(now = new Date()) {
  const completions = getGamificationData().completions
  if (!completions.length) throw new Error('Aucune séance terminée à exporter pour le moment.')

  const csv = completedSessionsToCsv(completions)
  const filename = `mes_courses_${localDateKey(now)}.csv`
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
  return { filename, count: completions.length }
}

export function exportLocalStorageJson(now = new Date()) {
  const backup = buildLocalStorageBackup({ now })
  const filename = `jcpmf_backup_${localDateKey(now)}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  downloadBlob(blob, filename)
  return { filename, count: backup.itemCount }
}
