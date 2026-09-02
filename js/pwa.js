let installPrompt = null

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function installButtons() {
  return [...document.querySelectorAll('[data-install-app]')]
}

function updateButtons() {
  const visible = !isInstalled() && (Boolean(installPrompt) || isIos())
  installButtons().forEach((button) => { button.hidden = !visible })
}

async function requestInstallation() {
  if (installPrompt) {
    installPrompt.prompt()
    await installPrompt.userChoice
    installPrompt = null
    updateButtons()
    return
  }

  if (isIos()) {
    window.alert('Pour installer JCPMF : touchez le bouton Partager de Safari, puis « Sur l’écran d’accueil ».')
    return
  }

  window.alert('Ouvrez le menu du navigateur puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».')
}

export function setupInstallButtons() {
  installButtons().forEach((button) => {
    if (button.dataset.installReady) return
    button.dataset.installReady = 'true'
    button.addEventListener('click', requestInstallation)
  })
  updateButtons()
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installPrompt = event
  updateButtons()
})

window.addEventListener('appinstalled', () => {
  installPrompt = null
  updateButtons()
})

if ('serviceWorker' in navigator && (window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname))) {
  navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.warn('Installation hors ligne indisponible :', error)
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupInstallButtons)
else setupInstallButtons()
