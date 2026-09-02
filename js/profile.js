import { api } from './api.js'
import {
  PRESET_AVATARS,
  getSelectedPresetAvatar,
  hasProfileAvatar,
  removeProfileAvatar,
  renderProfileAvatar,
  saveProfileAvatar,
  selectPresetAvatar,
} from './avatar.js'
import { getAppearancePreferences, setDynamicColorsEnabled, setTheme } from './appearance.js'
import { escapeHtml, mountNavigation, requireUser, showMessage } from './common.js'
import { exportCompletedSessionsCsv } from './data-export.js'
import { mountReminderSettings } from './reminder-ui.js'

const profile = document.querySelector('#profile')
const message = document.querySelector('#message')

async function load() {
  const user = await requireUser()
  if (!user) return
  if (user.role === 'admin') {
    window.location.replace('/admin.html')
    return
  }
  mountNavigation(user)
  profile.className = ''
  profile.innerHTML = `
    <header class="profile-header">
      <div class="profile-photo-editor">
        <label class="profile-avatar-picker" for="profile-avatar-input" aria-label="Choisir une photo de profil">
          <span class="profile-avatar" data-user-avatar></span>
          <span class="avatar-edit-badge" aria-hidden="true">📷</span>
          <input id="profile-avatar-input" class="visually-hidden" type="file" accept="image/*">
        </label>
      </div>
      <div class="profile-header-copy"><p class="eyebrow">Espace personnel</p><h1>Mon profil</h1><p class="muted">Votre compte et les réglages du parcours.</p></div>
    </header>
    <section class="card profile-photo-card">
      <div><h2>Photo de profil</h2><p class="muted">Votre photo est compressée et reste uniquement sur cet appareil.</p></div>
      <div class="profile-avatar-actions">
        <button id="choose-avatar" class="button" type="button">Importer une photo</button>
        <button id="remove-avatar" class="button button-ghost" type="button" ${hasProfileAvatar() ? '' : 'hidden'}>Réinitialiser l’avatar</button>
      </div>
      <fieldset class="avatar-gallery-fieldset">
        <legend>Ou choisir un avatar</legend>
        <p class="muted">Ces illustrations sont incluses dans l’application et fonctionnent aussi hors ligne.</p>
        <div class="avatar-gallery" aria-label="Avatars prédéfinis">
          ${PRESET_AVATARS.map((avatar) => `
            <button class="avatar-option ${getSelectedPresetAvatar() === avatar.path ? 'active' : ''}" type="button" data-preset-avatar="${avatar.path}" aria-pressed="${getSelectedPresetAvatar() === avatar.path}">
              <span class="avatar-option-image"><img src="${avatar.path}" alt=""><span class="avatar-check" aria-hidden="true">✓</span></span>
              <span>${escapeHtml(avatar.label)}</span>
            </button>`).join('')}
        </div>
      </fieldset>
      <p id="avatar-status" class="avatar-status" role="status"></p>
    </section>
    <section class="card">
      <div class="profile-field"><span>Nom d’utilisateur</span><strong>${escapeHtml(user.username)}</strong></div>
      <div class="profile-field"><span>Adresse e-mail</span><strong>${escapeHtml(user.email)}</strong></div>
      <div class="profile-field"><span>Type de compte</span><strong>Coureur</strong></div>
    </section>
    <section class="card data-export-card" aria-labelledby="csv-export-title">
      <span class="settings-icon" aria-hidden="true">📊</span>
      <div class="settings-copy">
        <p class="eyebrow">Mes données</p>
        <h2 id="csv-export-title">Historique des séances</h2>
        <p class="muted">Téléchargez vos séances terminées dans un fichier compatible avec Excel.</p>
      </div>
      <button id="export-csv" class="button button-ghost" type="button">Exporter mes données CSV</button>
      <p id="export-csv-status" class="export-status" role="status"></p>
    </section>
    <section class="card appearance-card" aria-labelledby="appearance-title">
      <div class="appearance-heading">
        <span class="settings-icon" aria-hidden="true">◐</span>
        <div class="settings-copy">
          <p class="eyebrow">Préférences</p>
          <h2 id="appearance-title">Apparence</h2>
          <p class="muted">Personnalisez discrètement l’affichage sur cet appareil.</p>
        </div>
      </div>
      <div class="appearance-controls">
        <label for="theme-select">Thème
          <select id="theme-select" name="theme">
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
            <option value="auto">Automatique selon le système</option>
          </select>
        </label>
        <label class="toggle-setting" for="dynamic-colors">
          <span><strong>Couleurs d’effort</strong><small>Adapter le fond à l’exercice en cours.</small></span>
          <input id="dynamic-colors" type="checkbox" role="switch">
          <span class="toggle-switch" aria-hidden="true"></span>
        </label>
      </div>
      <p id="appearance-status" class="appearance-status" role="status"></p>
    </section>
    <section id="reminder-settings" class="card settings-card" aria-label="Réglages des rappels"></section>
    <section class="card danger-zone">
      <h2>Réinitialiser ma progression</h2>
      <p class="muted">Toutes les séances et tous les bilans seront effacés. Votre compte et le programme sont conservés.</p>
      <button id="reset-all" class="button button-danger" type="button">Tout réinitialiser</button>
    </section>`

  const avatarTarget = document.querySelector('.profile-avatar')
  const avatarInput = document.querySelector('#profile-avatar-input')
  const avatarStatus = document.querySelector('#avatar-status')
  const removeAvatarButton = document.querySelector('#remove-avatar')
  renderProfileAvatar(avatarTarget, user.username)

  function setAvatarStatus(text, type = '') {
    avatarStatus.textContent = text
    avatarStatus.className = `avatar-status ${type}`.trim()
  }

  function updateAvatarSelection() {
    const selected = getSelectedPresetAvatar()
    document.querySelectorAll('[data-preset-avatar]').forEach((button) => {
      const active = button.dataset.presetAvatar === selected
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
    })
  }

  document.querySelector('#choose-avatar').addEventListener('click', () => avatarInput.click())
  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0]
    if (!file) return
    setAvatarStatus('Préparation de la photo…')
    try {
      await saveProfileAvatar(file, {
        onPreview: (source) => renderProfileAvatar(avatarTarget, user.username, source),
      })
      updateAvatarSelection()
      removeAvatarButton.hidden = false
      setAvatarStatus('Photo enregistrée sur cet appareil.', 'success')
    } catch (error) {
      renderProfileAvatar(avatarTarget, user.username)
      setAvatarStatus(error.message, 'error')
    } finally {
      avatarInput.value = ''
    }
  })
  document.querySelectorAll('[data-preset-avatar]').forEach((button) => {
    button.addEventListener('click', () => {
      try {
        selectPresetAvatar(button.dataset.presetAvatar)
        updateAvatarSelection()
        removeAvatarButton.hidden = false
        setAvatarStatus('Avatar enregistré sur cet appareil.', 'success')
      } catch (error) {
        setAvatarStatus(error.message, 'error')
      }
    })
  })
  removeAvatarButton.addEventListener('click', () => {
    try {
      removeProfileAvatar()
      updateAvatarSelection()
      removeAvatarButton.hidden = true
      setAvatarStatus('Photo supprimée. Vos initiales sont de nouveau affichées.', 'success')
    } catch (error) {
      setAvatarStatus(error.message, 'error')
    }
  })

  mountReminderSettings(document.querySelector('#reminder-settings'))

  const appearance = getAppearancePreferences()
  const themeSelect = document.querySelector('#theme-select')
  const dynamicColors = document.querySelector('#dynamic-colors')
  const appearanceStatus = document.querySelector('#appearance-status')
  themeSelect.value = appearance.theme
  dynamicColors.checked = appearance.dynamicColorsEnabled

  function saveAppearance(changePreference) {
    try {
      changePreference()
      appearanceStatus.textContent = 'Préférence enregistrée sur cet appareil.'
      appearanceStatus.className = 'appearance-status success'
    } catch (error) {
      appearanceStatus.textContent = error.message
      appearanceStatus.className = 'appearance-status error'
    }
  }

  themeSelect.addEventListener('change', () => saveAppearance(() => setTheme(themeSelect.value)))
  dynamicColors.addEventListener('change', () => saveAppearance(() => setDynamicColorsEnabled(dynamicColors.checked)))

  document.querySelector('#export-csv').addEventListener('click', (event) => {
    const status = document.querySelector('#export-csv-status')
    event.currentTarget.disabled = true
    try {
      const result = exportCompletedSessionsCsv()
      status.textContent = `${result.count} séance${result.count > 1 ? 's' : ''} exportée${result.count > 1 ? 's' : ''} dans ${result.filename}.`
      status.className = 'export-status success'
    } catch (error) {
      status.textContent = error.message
      status.className = 'export-status error'
    } finally {
      event.currentTarget.disabled = false
    }
  })

  document.querySelector('#reset-all').addEventListener('click', async (event) => {
    if (!window.confirm('Réinitialiser toute votre progression ?')) return
    event.target.disabled = true
    try {
      await api('/runner/progress/all', { method: 'DELETE' })
      showMessage(message, 'Votre progression a été réinitialisée.', 'success')
    } catch (error) {
      showMessage(message, error.message)
    } finally {
      event.target.disabled = false
    }
  })
}

load()
