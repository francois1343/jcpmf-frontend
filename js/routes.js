import { escapeHtml, mountNavigation, requireUser, showMessage } from './common.js'
import {
  formatAveragePace,
  formatRunDuration,
  haversineDistanceMeters,
  loadRoutes,
  routeProgress,
} from './routes-core.js'
import { createRecommendedRoutes, geocodeAddress } from './route-planner.js'

const routesList = document.querySelector('#routes-list')
const routePanel = document.querySelector('#route-panel')
const routeTitle = document.querySelector('#selected-route-title')
const routeMeta = document.querySelector('#selected-route-meta')
const message = document.querySelector('#message')
const gpsStatus = document.querySelector('#gps-status')
const locateButton = document.querySelector('#locate-runner')
const followCheckbox = document.querySelector('#follow-position')
const pauseButton = document.querySelector('#pause-run')
const finishButton = document.querySelector('#finish-run')
const gpsOriginButton = document.querySelector('#use-gps-origin')
const addressForm = document.querySelector('#address-form')
const addressInput = document.querySelector('#start-address')
const addressButton = document.querySelector('#search-address')
const originStatus = document.querySelector('#origin-status')

// État unique de la sortie : la trace GPS n'est jamais persistée ni envoyée à l'API JCPMF.
const state = {
  routes: [],
  routePresets: [],
  selectedRoute: null,
  origin: null,
  originLabel: '',
  plannerBusy: false,
  map: null,
  routePolyline: null,
  actualPolyline: null,
  startMarker: null,
  finishMarker: null,
  runnerMarker: null,
  accuracyCircle: null,
  watchId: null,
  followPosition: true,
  runStatus: 'idle',
  trackedPoints: [],
  lastTrackedPoint: null,
  lastPosition: null,
  distanceMeters: 0,
  elapsedBeforePauseMs: 0,
  resumedAt: null,
  timerId: null,
}

function isRunActive() {
  return ['waiting', 'running', 'paused'].includes(state.runStatus)
}

function difficultyClass(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function renderRoutes() {
  routesList.setAttribute('aria-busy', String(state.plannerBusy))
  if (!state.routes.length) {
    routesList.innerHTML = state.plannerBusy
      ? '<p class="loading">Calcul des chemins et du dénivelé…</p>'
      : '<p class="route-empty">Localisez-vous ou indiquez une adresse pour recevoir trois propositions.</p>'
    return
  }
  routesList.innerHTML = state.routes.map((route) => {
    const selected = route.id === state.selectedRoute?.id
    const elevation = route.elevationAvailable === false ? 'Indisponible' : `+${route.deniveleM} m`
    return `
      <article class="route-card ${selected ? 'selected' : ''}">
        <div class="route-card-heading"><h3>${escapeHtml(route.titre)}</h3><span class="route-difficulty difficulty-${difficultyClass(route.difficulte)}">${escapeHtml(route.difficulte)}</span></div>
        <p>${escapeHtml(route.description)}</p>
        <div class="route-facts"><span><strong>${route.distanceKm.toLocaleString('fr-BE')} km</strong> distance calculée</span><span><strong>${elevation}</strong> dénivelé positif</span></div>
        <div class="route-card-actions">
          <button class="button button-ghost" type="button" data-route-action="view" data-route-id="${escapeHtml(route.id)}">Voir le parcours</button>
          <button class="button" type="button" data-route-action="start" data-route-id="${escapeHtml(route.id)}" ${isRunActive() ? 'disabled' : ''}>Démarrer</button>
        </div>
      </article>`
  }).join('')
}

function setOriginStatus(text, type = '') {
  originStatus.textContent = text
  originStatus.className = `origin-status ${type}`.trim()
}

function setGpsStatus(text, type = '') {
  gpsStatus.textContent = text
  gpsStatus.className = `gps-status ${type}`.trim()
}

function removeMapLayer(layer) {
  if (layer && state.map?.hasLayer(layer)) state.map.removeLayer(layer)
}

function clearRouteLayers() {
  removeMapLayer(state.routePolyline)
  removeMapLayer(state.startMarker)
  removeMapLayer(state.finishMarker)
  state.routePolyline = null
  state.startMarker = null
  state.finishMarker = null
}

function clearActualTrack() {
  removeMapLayer(state.actualPolyline)
  state.actualPolyline = null
  state.trackedPoints = []
  state.lastTrackedPoint = null
  state.distanceMeters = 0
  state.elapsedBeforePauseMs = 0
  state.resumedAt = null
}

function drawSelectedRoute(route) {
  clearRouteLayers()
  state.routePolyline = L.polyline(route.coordinates, {
    color: '#1d7a48',
    weight: 6,
    opacity: .9,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(state.map)
  const start = route.coordinates[0]
  const finish = route.coordinates.at(-1)
  state.startMarker = L.circleMarker(start, {
    radius: 8,
    color: '#ffffff',
    weight: 3,
    fillColor: '#17683e',
    fillOpacity: 1,
  }).addTo(state.map).bindTooltip('Départ')
  state.finishMarker = L.circleMarker(finish, {
    radius: 8,
    color: '#ffffff',
    weight: 3,
    fillColor: '#a32b2b',
    fillOpacity: 1,
  }).addTo(state.map).bindTooltip('Arrivée')
  state.map.fitBounds(state.routePolyline.getBounds(), { padding: [28, 28] })
}

function resetRunMetrics() {
  document.querySelector('#run-time').textContent = '00:00:00'
  document.querySelector('#run-distance').textContent = '0,00 km'
  document.querySelector('#run-pace').textContent = '--:-- /km'
  document.querySelector('#run-progress').textContent = '0 %'
  document.querySelector('#run-progress-bar').style.width = '0%'
}

// Le temps actif exclut automatiquement toutes les périodes de pause.
function elapsedMilliseconds() {
  return state.elapsedBeforePauseMs + (state.runStatus === 'running' && state.resumedAt ? Date.now() - state.resumedAt : 0)
}

function updateRunMetrics() {
  const elapsed = elapsedMilliseconds()
  const progress = routeProgress(state.distanceMeters, state.selectedRoute?.distanceKm)
  document.querySelector('#run-time').textContent = formatRunDuration(elapsed)
  document.querySelector('#run-distance').textContent = `${(state.distanceMeters / 1000).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
  document.querySelector('#run-pace').textContent = formatAveragePace(elapsed, state.distanceMeters)
  document.querySelector('#run-progress').textContent = `${Math.round(progress)} %`
  document.querySelector('#run-progress-bar').style.width = `${progress}%`
}

function updateRunControls() {
  pauseButton.disabled = !['running', 'paused'].includes(state.runStatus)
  finishButton.disabled = !isRunActive()
  pauseButton.textContent = state.runStatus === 'paused' ? 'Reprendre' : 'Pause'
  followCheckbox.checked = state.followPosition
  gpsOriginButton.disabled = isRunActive() || state.plannerBusy
  locateButton.disabled = state.plannerBusy
  addressInput.disabled = isRunActive() || state.plannerBusy
  addressButton.disabled = isRunActive() || state.plannerBusy
  renderRoutes()
}

function selectRoute(route, { scroll = false } = {}) {
  if (isRunActive() && route.id !== state.selectedRoute?.id) {
    setGpsStatus('Terminez la course en cours avant de changer de parcours.', 'error')
    return false
  }
  if (!isRunActive()) {
    clearActualTrack()
    state.runStatus = 'idle'
    resetRunMetrics()
  }
  state.selectedRoute = route
  routeTitle.textContent = route.titre
  const elevation = route.elevationAvailable === false ? 'dénivelé indisponible' : `+${route.deniveleM} m`
  routeMeta.textContent = `${route.distanceKm.toLocaleString('fr-BE')} km · ${elevation} · ${route.difficulte}`
  drawSelectedRoute(route)
  updateRunControls()
  if (scroll) routePanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

function stopGpsWatch() {
  if (state.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(state.watchId)
  state.watchId = null
  window.clearInterval(state.timerId)
  state.timerId = null
}

function abortRun(text) {
  stopGpsWatch()
  state.runStatus = 'idle'
  state.elapsedBeforePauseMs = 0
  state.resumedAt = null
  updateRunMetrics()
  updateRunControls()
  setGpsStatus(text, 'error')
}

function recenterOnRunner() {
  if (!state.map || !state.lastPosition) return
  state.followPosition = true
  followCheckbox.checked = true
  state.map.setView([state.lastPosition.latitude, state.lastPosition.longitude], Math.max(16, state.map.getZoom()), { animate: true })
}

// Met à jour le marqueur GPS. La trace n'est enrichie que pendant l'état « running ».
function handleGpsPosition(position) {
  const current = {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy: Math.max(0, Number(position.coords.accuracy) || 0),
    timestamp: Number(position.timestamp) || Date.now(),
  }
  if (!Number.isFinite(current.latitude) || !Number.isFinite(current.longitude)) return
  state.lastPosition = current
  const latLng = [current.latitude, current.longitude]

  if (!state.runnerMarker) {
    state.runnerMarker = L.circleMarker(latLng, {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#1877d2',
      fillOpacity: 1,
    }).addTo(state.map).bindTooltip('Votre position')
    state.accuracyCircle = L.circle(latLng, { radius: current.accuracy, color: '#1877d2', weight: 1, fillOpacity: .08 }).addTo(state.map)
  } else {
    state.runnerMarker.setLatLng(latLng)
    state.accuracyCircle.setLatLng(latLng).setRadius(current.accuracy)
  }
  locateButton.textContent = '⌖ Recentrer'

  if (state.runStatus === 'waiting') {
    state.runStatus = 'running'
    state.resumedAt = Date.now()
    state.timerId = window.setInterval(updateRunMetrics, 1000)
    updateRunControls()
  }

  if (state.runStatus === 'running' && current.accuracy <= 50) {
    if (!state.lastTrackedPoint) {
      state.trackedPoints.push(latLng)
      state.lastTrackedPoint = current
    } else {
      const delta = haversineDistanceMeters(state.lastTrackedPoint, current)
      const seconds = Math.max(1, (current.timestamp - state.lastTrackedPoint.timestamp) / 1000)
      const maximumPlausibleDelta = Math.max(60, seconds * 12)
      if (delta >= 2 && delta <= maximumPlausibleDelta) {
        state.distanceMeters += delta
        state.trackedPoints.push(latLng)
        state.lastTrackedPoint = current
      }
    }
    state.actualPolyline.setLatLngs(state.trackedPoints)
    updateRunMetrics()
  }

  setGpsStatus(current.accuracy <= 50
    ? `GPS actif · précision ±${Math.round(current.accuracy)} m · trace locale uniquement`
    : `Signal GPS faible · précision ±${Math.round(current.accuracy)} m`, current.accuracy <= 50 ? 'success' : 'warning')
  if (state.followPosition) state.map.setView(latLng, Math.max(16, state.map.getZoom()), { animate: true })
}

function handleGpsError(error) {
  const messages = {
    1: 'Accès GPS refusé. Autorisez la localisation dans les réglages du navigateur.',
    2: 'Position GPS indisponible. Placez-vous à l’extérieur puis réessayez.',
    3: 'La localisation prend trop de temps. Vérifiez le signal GPS.',
  }
  const text = messages[error.code] || 'Impossible de récupérer votre position GPS.'
  if (error.code === 1 && isRunActive()) abortRun(text)
  else setGpsStatus(text, 'error')
}

function startRun(route) {
  if (!navigator.geolocation) {
    setGpsStatus('La géolocalisation n’est pas disponible sur cet appareil.', 'error')
    return
  }
  if (!selectRoute(route, { scroll: true }) || isRunActive()) return

  clearActualTrack()
  resetRunMetrics()
  state.actualPolyline = L.polyline([], { color: '#f97316', weight: 6, opacity: .95, lineCap: 'round' }).addTo(state.map)
  state.runStatus = 'waiting'
  state.followPosition = true
  setGpsStatus('Recherche du signal GPS… Autorisez la localisation pour commencer.')
  try {
    state.watchId = navigator.geolocation.watchPosition(handleGpsPosition, handleGpsError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 12000,
    })
    updateRunControls()
  } catch {
    abortRun('Impossible de démarrer le suivi GPS.')
  }
}

// La surveillance GPS continue pendant une pause pour garder le marqueur visible,
// mais lastTrackedPoint est réinitialisé afin de ne pas compter le déplacement en pause.
function togglePause() {
  if (state.runStatus === 'running') {
    state.elapsedBeforePauseMs = elapsedMilliseconds()
    state.resumedAt = null
    state.lastTrackedPoint = null
    state.runStatus = 'paused'
    setGpsStatus('Course en pause · la position reste visible mais la trace est arrêtée.', 'warning')
  } else if (state.runStatus === 'paused') {
    state.resumedAt = Date.now()
    state.lastTrackedPoint = null
    state.runStatus = 'running'
    setGpsStatus('Course reprise · suivi GPS actif.', 'success')
  }
  updateRunMetrics()
  updateRunControls()
}

function finishRun() {
  if (!isRunActive()) return
  if (!window.confirm('Terminer cette course ? La trace actuelle ne pourra plus être reprise.')) return
  state.elapsedBeforePauseMs = elapsedMilliseconds()
  state.resumedAt = null
  state.runStatus = 'finished'
  stopGpsWatch()
  updateRunMetrics()
  updateRunControls()
  setGpsStatus(`Course terminée · ${(state.distanceMeters / 1000).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km parcourus.`, 'success')
}

async function planRoutesFromOrigin(origin, label) {
  if (isRunActive()) {
    setOriginStatus('Terminez la course en cours avant de changer de point de départ.', 'error')
    return
  }
  state.plannerBusy = true
  state.origin = { latitude: Number(origin.latitude), longitude: Number(origin.longitude) }
  state.originLabel = label
  state.routes = []
  state.selectedRoute = null
  clearRouteLayers()
  clearActualTrack()
  resetRunMetrics()
  routeTitle.textContent = 'Calcul des parcours…'
  routeMeta.textContent = 'Recherche de chemins adaptés à la course à pied et calcul du dénivelé.'
  setOriginStatus(`Calcul autour de ${label}…`)
  routesList.innerHTML = '<p class="loading">Calcul du parcours 1/3…</p>'
  routesList.setAttribute('aria-busy', 'true')
  state.map.setView([state.origin.latitude, state.origin.longitude], 14, { animate: true })
  updateRunControls()

  try {
    state.routes = await createRecommendedRoutes(state.origin, state.routePresets, {
      onProgress: ({ completed, total, found }) => {
        routesList.innerHTML = `<p class="loading">Calcul du parcours ${completed}/${total}… ${found} proposition${found > 1 ? 's' : ''} prête${found > 1 ? 's' : ''}.</p>`
        setOriginStatus(`Recherche des parcours autour de ${label} · étape ${completed}/${total}.`)
      },
    })
    selectRoute(state.routes[0])
    const routeCount = state.routes.length
    setOriginStatus(`${routeCount} parcours calculé${routeCount > 1 ? 's' : ''} au départ de ${label}.`, 'success')
    if (routeCount < 3) {
      setGpsStatus(`${routeCount} boucle${routeCount > 1 ? 's ont' : ' a'} pu être calculée${routeCount > 1 ? 's' : ''}. Le service n’a trouvé aucun chemin fiable pour les autres propositions.`, 'warning')
    }
  } catch (error) {
    state.routes = []
    routeTitle.textContent = 'Aucun parcours disponible'
    routeMeta.textContent = 'Modifiez légèrement le départ ou réessayez dans quelques instants.'
    setOriginStatus(error.message, 'error')
  } finally {
    state.plannerBusy = false
    updateRunControls()
  }
}

function requestGpsOrigin() {
  if (isRunActive()) {
    setOriginStatus('Terminez la course en cours avant de changer de départ.', 'error')
    return
  }
  if (!navigator.geolocation) {
    setOriginStatus('La géolocalisation n’est pas disponible sur cet appareil.', 'error')
    return
  }
  gpsOriginButton.disabled = true
  state.plannerBusy = true
  updateRunControls()
  setOriginStatus('Recherche de votre position GPS…')
  navigator.geolocation.getCurrentPosition((position) => {
    handleGpsPosition(position)
    planRoutesFromOrigin({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }, 'votre position GPS')
  }, (error) => {
    handleGpsError(error)
    setOriginStatus(gpsStatus.textContent, 'error')
    state.plannerBusy = false
    updateRunControls()
  }, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 12000,
  })
}

function locateRunner() {
  if (!navigator.geolocation) {
    setGpsStatus('La géolocalisation n’est pas disponible sur cet appareil.', 'error')
    return
  }
  if (state.lastPosition) {
    recenterOnRunner()
    return
  }
  if (state.plannerBusy || isRunActive()) return
  state.plannerBusy = true
  updateRunControls()
  setGpsStatus('Recherche de votre position…')
  navigator.geolocation.getCurrentPosition((position) => {
    handleGpsPosition(position)
    planRoutesFromOrigin({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }, 'votre position GPS')
  }, (error) => {
    handleGpsError(error)
    setOriginStatus(gpsStatus.textContent, 'error')
    state.plannerBusy = false
    updateRunControls()
  }, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 12000,
  })
}

async function handleAddressSubmit(event) {
  event.preventDefault()
  if (state.plannerBusy || isRunActive()) return
  state.plannerBusy = true
  updateRunControls()
  setOriginStatus('Recherche de l’adresse…')
  try {
    const result = await geocodeAddress(addressInput.value)
    state.plannerBusy = false
    await planRoutesFromOrigin(result, result.label)
  } catch (error) {
    state.plannerBusy = false
    updateRunControls()
    setOriginStatus(error.message, 'error')
  }
}

function initializeMap() {
  if (!globalThis.L) throw new Error('La carte Leaflet n’a pas pu être chargée. Vérifiez votre connexion.')
  state.map = L.map('route-map', { zoomControl: true }).setView([50.8503, 4.3517], 12)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(state.map)
  state.map.on('dragstart', () => {
    state.followPosition = false
    followCheckbox.checked = false
  })
}

// Les actions des cartes restent déléguées au conteneur, même après leur nouveau rendu.
routesList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-route-action]')
  if (!button) return
  const route = state.routes.find((item) => item.id === button.dataset.routeId)
  if (!route) return
  if (button.dataset.routeAction === 'start') startRun(route)
  else selectRoute(route, { scroll: true })
})

locateButton.addEventListener('click', locateRunner)
gpsOriginButton.addEventListener('click', requestGpsOrigin)
addressForm.addEventListener('submit', handleAddressSubmit)
followCheckbox.addEventListener('change', () => {
  state.followPosition = followCheckbox.checked
  if (state.followPosition) recenterOnRunner()
})
pauseButton.addEventListener('click', togglePause)
finishButton.addEventListener('click', finishRun)
window.addEventListener('beforeunload', stopGpsWatch)

async function start() {
  const user = await requireUser()
  if (!user) return
  if (user.role === 'admin') {
    window.location.replace('/admin.html')
    return
  }
  mountNavigation(user)
  try {
    initializeMap()
    state.routePresets = await loadRoutes()
    renderRoutes()
    window.requestAnimationFrame(() => state.map.invalidateSize())
  } catch (error) {
    routesList.innerHTML = '<p class="muted">Les parcours ne peuvent pas être affichés.</p>'
    showMessage(message, error.message)
  }
}

start()
