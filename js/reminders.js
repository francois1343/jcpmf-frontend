import { getGamificationStats } from './gamification.js'

const STORAGE_KEY = 'jcpmf_reminders_v1'
let checksStarted = false

export function getReminderSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return {
      enabled: Boolean(parsed?.enabled),
      inactivityDays: Math.min(30, Math.max(1, Number(parsed?.inactivityDays) || 3)),
      enabledAt: parsed?.enabledAt || null,
      lastNotificationDate: parsed?.lastNotificationDate || null,
      promptSeen: Boolean(parsed?.promptSeen || parsed?.enabled || parsed?.enabledAt),
    }
  } catch {
    return { enabled: false, inactivityDays: 3, enabledAt: null, lastNotificationDate: null, promptSeen: false }
  }
}

function saveReminderSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent('jcpmf:reminders-updated', { detail: settings }))
}

export function setReminderDelay(days) {
  const settings = getReminderSettings()
  settings.inactivityDays = Math.min(30, Math.max(1, Number(days) || 3))
  saveReminderSettings(settings)
  return settings
}

export function markReminderPromptSeen() {
  const settings = getReminderSettings()
  settings.promptSeen = true
  saveReminderSettings(settings)
  return settings
}

export async function enableReminders(days = 3) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Les notifications ne sont pas prises en charge par ce navigateur.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('L’autorisation de notification n’a pas été accordée.')
  const settings = getReminderSettings()
  settings.enabled = true
  settings.promptSeen = true
  settings.inactivityDays = Math.min(30, Math.max(1, Number(days) || 3))
  settings.enabledAt ||= new Date().toISOString()
  saveReminderSettings(settings)
  return settings
}

export function disableReminders() {
  const settings = getReminderSettings()
  settings.enabled = false
  saveReminderSettings(settings)
  return settings
}

function localDateKey(value = new Date()) {
  const date = new Date(value)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function elapsedDays(from, to = new Date()) {
  const start = new Date(from)
  const end = new Date(to)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((end - start) / 86400000))
}

export async function checkReminders() {
  const settings = getReminderSettings()
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false
  if (!settings.enabled || Notification.permission !== 'granted') return false
  const stats = getGamificationStats()
  const baseline = stats.lastCompletionAt || settings.enabledAt
  if (!baseline) return false
  const days = elapsedDays(baseline)
  const today = localDateKey()
  if (days < settings.inactivityDays || settings.lastNotificationDate === today) return false

  const registration = await navigator.serviceWorker.ready
  const payload = {
    type: 'SHOW_INACTIVITY_REMINDER',
    title: 'Votre série vous attend 🔥',
    body: `Déjà ${days} jour${days > 1 ? 's' : ''} sans séance ! Venez maintenir votre série de victoires.`,
  }
  if (registration.active) registration.active.postMessage(payload)
  else await registration.showNotification(payload.title, { body: payload.body, icon: '/icons/icon-192.png' })
  settings.lastNotificationDate = today
  saveReminderSettings(settings)
  return true
}

export function startReminderChecks() {
  if (checksStarted || !('Notification' in window) || !('serviceWorker' in navigator)) return
  checksStarted = true
  const checkSafely = () => checkReminders().catch((error) => console.warn('Rappel local indisponible :', error))
  window.setTimeout(checkSafely, 1500)
  window.setInterval(checkSafely, 60 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSafely()
  })
}
