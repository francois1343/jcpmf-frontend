// Page du profil et fenêtre des paramètres.
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
import { clearGamificationData } from './gamification.js'
import {
  getPhysicalProfile,
  PHYSICAL_GOALS,
  removePhysicalProfile,
  savePhysicalProfile,
} from './physical-profile.js'
import { mountReminderSettings } from './reminder-ui.js'

const profile = document.querySelector('#profile')
const message = document.querySelector('#message')
const profileIcons = {
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4Z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  follow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8.5c0 5-8 10.5-8 10.5S4 13.5 4 8.5A4.5 4.5 0 0 1 12 5a4.5 4.5 0 0 1 8 3.5Z"/></svg>',
  data: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7M3 19h18"/></svg>',
  appearance: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.73v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>',
}

async function load() {
  const user = await requireUser()
  if (!user) return
  if (user.role === 'admin') {
    window.location.replace('/admin.html')
    return
  }
  mountNavigation(user)
  const physicalProfile = getPhysicalProfile(user.id)
  profile.className = ''
  profile.innerHTML = `
    <header class="profile-header">
      <div class="profile-photo-editor">
        <label class="profile-avatar-picker" for="profile-avatar-input" aria-label="Choisir une photo de profil">
          <span class="profile-avatar" data-user-avatar></span>
          <span class="avatar-edit-badge" aria-hidden="true">${profileIcons.camera}</span>
          <input id="profile-avatar-input" class="visually-hidden" type="file" accept="image/*">
        </label>
      </div>
      <div class="profile-header-copy">
        <div class="profile-kicker-row">
          <p class="eyebrow">Espace personnel</p>
          <button id="open-profile-settings" class="profile-settings-trigger" type="button" aria-label="Ouvrir les paramètres" title="Paramètres" aria-haspopup="dialog" aria-controls="profile-settings-dialog">
            <span aria-hidden="true">${profileIcons.settings}</span>
          </button>
        </div>
        <h1>Mon profil</h1><p class="muted">Votre compte et les réglages du parcours.</p>
      </div>
    </header>
    <section class="card profile-module profile-photo-card">
      <div><p class="eyebrow">Avatar</p><h2>Votre image</h2><p class="muted">Photo ou illustration, conservée sur cet appareil.</p></div>
      <div class="profile-avatar-actions">
        <button id="choose-avatar" class="button" type="button">Importer une photo</button>
        <button id="remove-avatar" class="button button-ghost" type="button" ${hasProfileAvatar() ? '' : 'hidden'}>Réinitialiser l’avatar</button>
      </div>
      <fieldset class="avatar-gallery-fieldset">
        <legend>Choisir une illustration</legend>
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
    <section class="card profile-module profile-account-card" aria-label="Informations du compte">
      <div class="profile-field"><span>Nom d’utilisateur</span><strong>${escapeHtml(user.username)}</strong></div>
      <div class="profile-field"><span>Adresse e-mail</span><strong>${escapeHtml(user.email)}</strong></div>
      <div class="profile-field"><span>Type de compte</span><strong>Coureur</strong></div>
    </section>
    <section class="card profile-module physical-profile-card" aria-labelledby="physical-profile-title">
      <div class="physical-profile-heading">
        <span class="settings-icon" aria-hidden="true">${profileIcons.follow}</span>
        <div class="settings-copy">
          <p class="eyebrow">Mon suivi</p>
          <h2 id="physical-profile-title">Profil et objectifs</h2>
          <p class="muted">Des repères facultatifs pour personnaliser votre accueil. Données conservées sur cet appareil.</p>
        </div>
      </div>
      <form id="physical-profile-form" class="physical-profile-form">
        <div class="physical-measures">
          <label for="profile-gender">Genre <small>Pour accorder le message d’accueil</small>
            <select id="profile-gender" name="gender">
              <option value="" ${physicalProfile.gender ? '' : 'selected'}>Ne pas préciser</option>
              <option value="female" ${physicalProfile.gender === 'female' ? 'selected' : ''}>Femme</option>
              <option value="male" ${physicalProfile.gender === 'male' ? 'selected' : ''}>Homme</option>
            </select>
          </label>
          <label for="profile-age">Âge
            <span class="input-with-unit"><input id="profile-age" name="age" type="number" min="10" max="100" step="1" inputmode="numeric" value="${physicalProfile.age ?? ''}" placeholder="Ex. 35"><span>ans</span></span>
          </label>
          <label for="profile-weight">Poids
            <span class="input-with-unit"><input id="profile-weight" name="weightKg" type="number" min="25" max="300" step="0.1" inputmode="decimal" value="${physicalProfile.weightKg ?? ''}" placeholder="Ex. 72,5"><span>kg</span></span>
          </label>
        </div>
        <fieldset class="goals-fieldset">
          <legend>Progression des objectifs <small>Sélection multiple</small></legend>
          <div class="goal-options">
            ${PHYSICAL_GOALS.map((goal, index) => `
              <label class="goal-option">
                <span class="goal-order" aria-hidden="true">${index + 1}</span>
                <span class="goal-label">${escapeHtml(goal.label)}</span>
                <input type="checkbox" name="goals" value="${goal.value}" ${physicalProfile.goals.includes(goal.value) ? 'checked' : ''}>
              </label>`).join('')}
          </div>
        </fieldset>
        <div class="physical-profile-actions">
          <button class="button" type="submit">Enregistrer mon profil</button>
          <button id="clear-physical-profile" class="button button-ghost" type="button">Effacer ces informations</button>
        </div>
        <p id="physical-profile-status" class="profile-data-status" role="status"></p>
      </form>
    </section>
    <dialog id="profile-settings-dialog" class="profile-settings-dialog" aria-labelledby="profile-settings-title">
      <header class="profile-settings-dialog-header">
        <span class="profile-settings-dialog-icon" aria-hidden="true">${profileIcons.settings}</span>
        <div><p class="eyebrow">Réglages</p><h2 id="profile-settings-title">Paramètres</h2></div>
        <button id="close-profile-settings" class="profile-settings-dialog-close" type="button" aria-label="Fermer les paramètres">×</button>
      </header>
      <div class="profile-settings-content">
    <section class="card profile-module data-export-card" aria-labelledby="csv-export-title">
      <span class="settings-icon" aria-hidden="true">${profileIcons.data}</span>
      <div class="settings-copy">
        <p class="eyebrow">Mes données</p>
        <h2 id="csv-export-title">Historique des séances</h2>
        <p class="muted">Téléchargez vos séances terminées dans un fichier CSV.</p>
      </div>
      <button id="export-csv" class="button button-ghost" type="button">Exporter mes données CSV</button>
      <p id="export-csv-status" class="export-status" role="status"></p>
    </section>
    <section class="card profile-module appearance-card" aria-labelledby="appearance-title">
      <div class="appearance-heading">
        <span class="settings-icon" aria-hidden="true">${profileIcons.appearance}</span>
        <div class="settings-copy">
          <p class="eyebrow">Préférences</p>
          <h2 id="appearance-title">Apparence</h2>
          <p class="muted">Adaptez l’affichage sur cet appareil.</p>
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
    <section id="reminder-settings" class="card profile-module settings-card" aria-label="Réglages des rappels"></section>
    <section class="card profile-module danger-zone">
      <div><p class="eyebrow">Zone sensible</p><h2>Réinitialiser ma progression</h2><p class="muted">Efface les séances et bilans sans supprimer votre compte.</p></div>
      <button id="reset-all" class="button button-danger danger-zone-action" type="button">Tout réinitialiser</button>
    </section>
      </div>
    </dialog>`

  const settingsDialog = document.querySelector('#profile-settings-dialog')
  const settingsTrigger = document.querySelector('#open-profile-settings')
  settingsTrigger.addEventListener('click', () => {
    if (typeof settingsDialog.showModal === 'function') settingsDialog.showModal()
    else settingsDialog.setAttribute('open', '')
  })
  document.querySelector('#close-profile-settings').addEventListener('click', () => {
    if (typeof settingsDialog.close === 'function') settingsDialog.close()
    else settingsDialog.removeAttribute('open')
  })
  settingsDialog.addEventListener('click', (event) => {
    if (event.target === settingsDialog) settingsDialog.close()
  })
  settingsDialog.addEventListener('close', () => settingsTrigger.focus())

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

  const physicalProfileForm = document.querySelector('#physical-profile-form')
  const physicalProfileStatus = document.querySelector('#physical-profile-status')

  function setPhysicalProfileStatus(text, type = '') {
    physicalProfileStatus.textContent = text
    physicalProfileStatus.className = `profile-data-status ${type}`.trim()
  }

  physicalProfileForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const formData = new FormData(physicalProfileForm)
    try {
      savePhysicalProfile(user.id, {
        age: formData.get('age'),
        weightKg: formData.get('weightKg'),
        gender: formData.get('gender'),
        goals: formData.getAll('goals'),
      })
      setPhysicalProfileStatus('Profil physique enregistré sur cet appareil.', 'success')
    } catch (error) {
      setPhysicalProfileStatus(error.message, 'error')
    }
  })

  document.querySelector('#clear-physical-profile').addEventListener('click', () => {
    if (!window.confirm('Effacer votre âge, votre poids et vos objectifs sur cet appareil ?')) return
    removePhysicalProfile(user.id)
    physicalProfileForm.querySelectorAll('input[type="number"]').forEach((input) => { input.value = '' })
    physicalProfileForm.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false })
    physicalProfileForm.querySelector('#profile-gender').value = ''
    setPhysicalProfileStatus('Informations du profil physique effacées.', 'success')
  })

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
      const result = exportCompletedSessionsCsv(new Date(), user.id)
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
      clearGamificationData(user.id, { includeLegacy: true })
      showMessage(message, 'Votre progression a été réinitialisée.', 'success')
    } catch (error) {
      showMessage(message, error.message)
    } finally {
      event.target.disabled = false
    }
  })
}

load()
