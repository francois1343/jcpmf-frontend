async function permissionState() {
  try {
    const result = await navigator.permissions?.query({ name: 'geolocation' })
    return result?.state || 'prompt'
  } catch {
    return 'prompt'
  }
}

function noticeKey(scope) {
  return `jcpmf_location_notice_v1:${scope}`
}

function hasAcceptedNotice(scope) {
  try {
    return localStorage.getItem(noticeKey(scope)) === 'accepted'
  } catch {
    return false
  }
}

function markNoticeAccepted(scope) {
  try {
    localStorage.setItem(noticeKey(scope), 'accepted')
  } catch {
    // La permission du navigateur reste disponible même si le stockage local est indisponible.
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function' && dialog.open) dialog.close()
  dialog.remove()
}

export async function hasLocationAccess(scope = 'general') {
  if (!navigator.geolocation) return false
  return await permissionState() === 'granted' || hasAcceptedNotice(scope)
}

export async function confirmLocationAccess({
  title = 'Activer la localisation ?',
  description,
  details = 'Vous pourrez continuer à utiliser l’application sans l’activer.',
  confirmLabel = 'Continuer',
  scope = 'general',
} = {}) {
  if (!navigator.geolocation || await hasLocationAccess(scope)) return true

  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'reminder-dialog location-consent-dialog'
    dialog.setAttribute('aria-labelledby', 'location-consent-title')
    dialog.innerHTML = `
      <button class="dialog-close" type="button" aria-label="Fermer" data-location-dismiss>×</button>
      <div class="dialog-icon" aria-hidden="true">⌖</div>
      <p class="eyebrow">Votre confidentialité</p>
      <h2 id="location-consent-title"></h2>
      <p class="muted" data-location-description></p>
      <p class="location-consent-details" data-location-details></p>
      <div class="dialog-actions">
        <button class="button button-ghost" type="button" data-location-dismiss>Pas maintenant</button>
        <button class="button" type="button" data-location-confirm></button>
      </div>`
    dialog.querySelector('#location-consent-title').textContent = title
    dialog.querySelector('[data-location-description]').textContent = description
    dialog.querySelector('[data-location-details]').textContent = details
    dialog.querySelector('[data-location-confirm]').textContent = confirmLabel
    document.body.append(dialog)

    let settled = false
    const finish = (accepted) => {
      if (settled) return
      settled = true
      if (accepted) markNoticeAccepted(scope)
      closeDialog(dialog)
      resolve(accepted)
    }

    dialog.querySelectorAll('[data-location-dismiss]').forEach((button) => {
      button.addEventListener('click', () => finish(false))
    })
    dialog.querySelector('[data-location-confirm]').addEventListener('click', () => finish(true))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish(false)
    })
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(false)
    })

    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  })
}
