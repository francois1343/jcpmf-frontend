import './appearance.js'
import { clearSession, currentUser, getStoredUser, getToken } from './api.js'
import { renderProfileAvatar } from './avatar.js'
import { setupInstallButtons } from './pwa.js'
import { startReminderChecks } from './reminders.js'

startReminderChecks()

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character])
}

export function formatMinutes(seconds) {
  return Math.max(1, Math.round(Number(seconds || 0) / 60))
}

export function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds || 0))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function showMessage(element, message, type = 'error') {
  element.textContent = message
  element.className = `message ${type}`
  element.hidden = !message
}

export function setLoading(button, loading, label = 'Chargement…') {
  if (!button.dataset.label) button.dataset.label = button.textContent
  button.disabled = loading
  button.textContent = loading ? label : button.dataset.label
}

export async function requireUser(requiredRole = null) {
  if (!getToken()) {
    window.location.replace('/login.html')
    return null
  }
  try {
    const user = await currentUser()
    if (requiredRole && user.role !== requiredRole) {
      window.location.replace(user.role === 'admin' ? '/admin.html' : '/index.html')
      return null
    }
    return user
  } catch {
    window.location.replace('/login.html')
    return null
  }
}

export function redirectAuthenticatedUser() {
  const user = getStoredUser()
  if (getToken() && user) {
    window.location.replace(user.role === 'admin' ? '/admin.html' : '/index.html')
    return true
  }
  return false
}

export function mountNavigation(user) {
  const target = document.querySelector('[data-navigation]')
  if (!target) return
  target.innerHTML = `
    <nav class="app-nav">
      <a class="brand" href="${user.role === 'admin' ? '/admin.html' : '/index.html'}" aria-label="JCPMF — Accueil">
        <img src="/images/image.png" alt="Je cours pour ma forme">
      </a>
      <div class="nav-actions">
        <span class="nav-identity"><span class="nav-avatar" data-user-avatar aria-hidden="true"></span><span class="nav-user">${escapeHtml(user.username)}</span></span>
        ${user.role === 'admin'
          ? '<a href="/admin.html">Administration</a>'
          : '<a href="/routes.html">Parcours</a><a href="/profile.html">Mon profil</a>'}
        <button class="button button-ghost" type="button" data-install-app hidden>Installer</button>
        <button class="button button-ghost" type="button" data-logout>Déconnexion</button>
      </div>
    </nav>`
  renderProfileAvatar(target.querySelector('[data-user-avatar]'), user.username)
  setupInstallButtons()
  target.querySelector('[data-logout]').addEventListener('click', () => {
    clearSession()
    window.location.href = '/login.html'
  })
}
