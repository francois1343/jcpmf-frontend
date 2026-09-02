import {
  checkReminders,
  disableReminders,
  enableReminders,
  getReminderSettings,
  markReminderPromptSeen,
  setReminderDelay,
} from './reminders.js'

const delays = [1, 2, 3, 5, 7]
let settingsTarget = null
let settingsListenerReady = false

function supported() {
  return 'Notification' in window && 'serviceWorker' in navigator
}

function delayOptions(selected) {
  return delays.map((days) => `<option value="${days}" ${selected === days ? 'selected' : ''}>${days} jour${days > 1 ? 's' : ''}</option>`).join('')
}

function statusText(settings) {
  if (!supported()) return 'Les notifications ne sont pas disponibles sur ce navigateur.'
  if (Notification.permission === 'denied') return 'Les notifications sont bloquées dans les réglages du navigateur.'
  if (settings.enabled) return `Rappel actif après ${settings.inactivityDays} jour${settings.inactivityDays > 1 ? 's' : ''} sans séance.`
  return 'Aucun rappel actif pour le moment.'
}

function renderSettings() {
  if (!settingsTarget?.isConnected) return
  const settings = getReminderSettings()
  const canEnable = supported() && Notification.permission !== 'denied'
  settingsTarget.innerHTML = `
    <div class="settings-icon" aria-hidden="true">🔔</div>
    <div class="settings-copy">
      <p class="eyebrow">Application</p>
      <h2>Rappels d’activité</h2>
      <p class="muted">Choisissez si l’application doit vous relancer après plusieurs jours sans séance.</p>
    </div>
    <div class="reminder-settings-controls">
      <label for="profile-reminder-delay">Me prévenir après
        <select id="profile-reminder-delay">${delayOptions(settings.inactivityDays)}</select>
      </label>
      <button class="button ${settings.enabled ? 'button-ghost' : ''}" type="button" data-profile-reminders ${canEnable || settings.enabled ? '' : 'disabled'}>
        ${settings.enabled ? 'Désactiver' : 'Activer les rappels'}
      </button>
    </div>
    <p class="reminder-status" role="status">${statusText(settings)}</p>`

  const select = settingsTarget.querySelector('select')
  select.addEventListener('change', () => {
    setReminderDelay(select.value)
    checkReminders().catch(() => {})
  })
  settingsTarget.querySelector('[data-profile-reminders]').addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    try {
      if (getReminderSettings().enabled) disableReminders()
      else await enableReminders(select.value)
    } catch (error) {
      const status = settingsTarget?.querySelector('.reminder-status')
      if (status) status.textContent = error.message
    } finally {
      button.disabled = false
    }
  })
}

export function mountReminderSettings(target) {
  settingsTarget = target
  if (!settingsListenerReady) {
    window.addEventListener('jcpmf:reminders-updated', renderSettings)
    settingsListenerReady = true
  }
  renderSettings()
}

function closePrompt(dialog) {
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.remove()
}

export function showReminderOnboardingOnce() {
  const settings = getReminderSettings()
  if (settings.promptSeen || settings.enabled || !supported() || document.querySelector('#reminder-onboarding')) return
  if (Notification.permission === 'denied') {
    markReminderPromptSeen()
    return
  }

  const dialog = document.createElement('dialog')
  dialog.id = 'reminder-onboarding'
  dialog.className = 'reminder-dialog'
  dialog.setAttribute('aria-labelledby', 'reminder-dialog-title')
  dialog.innerHTML = `
    <button class="dialog-close" type="button" data-reminder-dismiss aria-label="Fermer">×</button>
    <div class="dialog-icon" aria-hidden="true">🔥</div>
    <p class="eyebrow">Un petit coup de pouce ?</p>
    <h2 id="reminder-dialog-title">Gardez votre rythme</h2>
    <p class="muted">JCPMF peut vous rappeler de revenir après quelques jours sans séance. Le choix restera modifiable dans votre profil.</p>
    <label for="onboarding-reminder-delay">Me rappeler après
      <select id="onboarding-reminder-delay">${delayOptions(settings.inactivityDays)}</select>
    </label>
    <div class="dialog-actions">
      <button class="button button-ghost" type="button" data-reminder-dismiss>Non merci</button>
      <button class="button" type="button" data-reminder-enable>Activer les rappels</button>
    </div>
    <p class="reminder-dialog-status" role="status"></p>`
  document.body.append(dialog)

  const dismiss = () => {
    markReminderPromptSeen()
    closePrompt(dialog)
  }
  dialog.querySelectorAll('[data-reminder-dismiss]').forEach((button) => button.addEventListener('click', dismiss))
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dismiss()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dismiss()
  })
  dialog.addEventListener('close', () => dialog.remove(), { once: true })
  dialog.querySelector('[data-reminder-enable]').addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    try {
      await enableReminders(dialog.querySelector('select').value)
      closePrompt(dialog)
    } catch (error) {
      markReminderPromptSeen()
      dialog.querySelector('.reminder-dialog-status').textContent = error.message
      button.disabled = false
    }
  })

  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}
