import './appearance.js'
import { clearSession, currentUser, getToken } from './api.js'
import { renderProfileAvatar } from './avatar.js'
import { setupInstallButtons } from './pwa.js'
import { startReminderChecks } from './reminders.js'

startReminderChecks()

const navigationIcons = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/></svg>',
  admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
  routes: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7"/></svg>',
  profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20c.8-4.2 3.1-6.3 7-6.3s6.2 2.1 7 6.3"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m-4-4 4 4 4-4M5 18v2h14v-2"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5m4-12 4 4-4 4m-6-4h10"/></svg>',
}

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

export async function redirectAuthenticatedUser() {
  const requestToken = getToken()
  if (!requestToken) return false

  try {
    const user = await currentUser()
    if (getToken() !== requestToken) return false
    window.location.replace(user.role === 'admin' ? '/admin.html' : '/index.html')
    return true
  } catch {
    // La page de connexion reste affichée si le token est expiré ou si
    // le backend est temporairement indisponible. Cela évite une boucle
    // login.html -> index.html -> login.html basée sur une session en cache.
    return false
  }
}

export function mountNavigation(user) {
  const target = document.querySelector('[data-navigation]')
  if (!target) return
  const homePath = user.role === 'admin' ? '/admin.html' : '/index.html'
  const currentPath = window.location.pathname === '/' ? '/index.html' : window.location.pathname
  const showHomeHint = currentPath !== homePath
  target.innerHTML = `
    <nav class="app-nav">
      <a class="brand" href="${homePath}" aria-label="Retour à l’accueil">
        <img src="/images/image.png" alt="Je cours pour ma forme">
        ${showHomeHint ? `<span class="brand-home-button" aria-hidden="true">${navigationIcons.home}</span>` : ''}
      </a>
      <div class="nav-actions">
        <span class="nav-identity"><span class="nav-avatar" data-user-avatar aria-hidden="true"></span><span class="nav-user">${escapeHtml(user.username)}</span>${user.demo ? '<span class="nav-demo-badge">Démo</span>' : ''}</span>
        ${user.role === 'admin'
          ? `<a class="nav-action nav-action-admin" href="/admin.html"><span class="nav-action-icon">${navigationIcons.admin}</span><span>Administration</span></a>`
          : `<a class="nav-action nav-action-routes" href="/routes.html"><span class="nav-action-icon">${navigationIcons.routes}</span><span>Parcours</span></a>
             <a class="nav-action nav-action-profile nav-action-icon-only" href="/profile.html" aria-label="Mon profil" title="Mon profil"><span class="nav-action-icon">${navigationIcons.profile}</span></a>`}
        <button class="nav-action nav-action-logout nav-action-icon-only" type="button" data-logout aria-label="Se déconnecter" title="Se déconnecter"><span class="nav-action-icon">${navigationIcons.logout}</span></button>
      </div>
    </nav>
    <aside class="install-popup" data-install-popup role="dialog" aria-labelledby="install-popup-title" hidden>
      <button class="install-popup-close" type="button" data-install-dismiss aria-label="Fermer la proposition d’installation">×</button>
      <span class="install-popup-icon" aria-hidden="true">${navigationIcons.install}</span>
      <div class="install-popup-copy">
        <p class="eyebrow">Application JCPMF</p>
        <strong id="install-popup-title">Installer sur cet appareil</strong>
        <p>Accédez plus rapidement à vos séances, même depuis l’écran d’accueil.</p>
      </div>
      <button class="button install-popup-action" type="button" data-install-app hidden>Installer</button>
    </aside>`
  renderProfileAvatar(target.querySelector('[data-user-avatar]'), user.username)
  target.querySelectorAll('.nav-action[href]').forEach((link) => {
    if (new URL(link.href).pathname === window.location.pathname) link.setAttribute('aria-current', 'page')
  })
  setupInstallButtons()
  target.querySelector('[data-logout]').addEventListener('click', () => {
    clearSession()
    window.location.href = '/login.html'
  })
}
