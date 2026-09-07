import { api } from './api.js'
import { APPEARANCE_EVENT, isDynamicColorsEnabled } from './appearance.js'
import { escapeHtml, formatMinutes, formatTime, mountNavigation, requireUser, showMessage } from './common.js'
import { effortDurationOf, getGamificationStats, getLatestSessionCompletion, recordSessionCompletion } from './gamification.js'
import { confirmLocationAccess } from './location-consent.js'
import { prepareShareSummary, sharePreparedSummary } from './share-summary.js'

const container = document.querySelector('#session')
const message = document.querySelector('#message')
const sessionId = Number(new URLSearchParams(window.location.search).get('id'))
const labels = { warmup: 'Échauffement', run: 'Course', walk: 'Marche', sprint: 'Sprint', stretching: 'Étirements' }
let session = null
let timerId = null
let gpsWatchId = null
let lastPosition = null
let lastStepAt = 0
let motionHandler = null
let state = null
let userId = null

function durationOf(exercise) {
  return Number(exercise?.durationSeconds ?? exercise?.duration_seconds ?? 0)
}

function conciseSessionDescription() {
  const description = String(session?.description || '').trim()
  const firstSentenceEnd = description.indexOf('.')
  if (firstSentenceEnd === -1) return description

  const firstSentence = description.slice(0, firstSentenceEnd).toLocaleLowerCase('fr')
  const repeatedContext = [session?.weekTitle, session?.title]
    .filter(Boolean)
    .every((label) => firstSentence.includes(String(label).toLocaleLowerCase('fr')))

  return repeatedContext ? description.slice(firstSentenceEnd + 1).trim() : description
}

function storageKey() {
  return `jcpmf-vanilla-session-${sessionId}`
}

function saveState() {
  localStorage.setItem(storageKey(), JSON.stringify(state))
}

function restoreState() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey()) || 'null')
    if (!stored || !Number.isInteger(stored.currentIndex)) return null
    return { ...stored, running: false }
  } catch {
    return null
  }
}

function exerciseType(exercise) {
  const type = exercise?.type === 'cooldown' ? 'stretching' : exercise?.type
  return labels[type] ? type : 'warmup'
}

function playCue() {
  const type = exerciseType(session.exercises[state.currentIndex])
  const audio = new Audio(`/sons/${type}.mp3`)
  audio.play().catch(() => {
    if ('speechSynthesis' in window) {
      const cue = new SpeechSynthesisUtterance(labels[type])
      cue.lang = 'fr-FR'
      window.speechSynthesis.speak(cue)
    }
  })
}

function distanceBetween(left, right) {
  const radius = 6371
  const radians = (value) => value * Math.PI / 180
  const latitude = radians(right.latitude - left.latitude)
  const longitude = radians(right.longitude - left.longitude)
  const value = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitude / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

async function startTracking(reset = false) {
  if (reset) {
    state.distanceKm = 0
    state.stepsCount = 0
    lastPosition = null
  }

  if (state.locationEnabled && 'geolocation' in navigator && gpsWatchId === null) {
    gpsWatchId = navigator.geolocation.watchPosition((position) => {
      const current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }
      if (state.running && lastPosition && current.accuracy <= 50) {
        const delta = distanceBetween(lastPosition, current)
        if (delta < .25) state.distanceKm += delta
      }
      if (current.accuracy <= 50) lastPosition = current
      updateMeasurements()
      saveState()
    }, () => {}, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 })
  }

  if (typeof DeviceMotionEvent !== 'undefined' && !motionHandler) {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try { await DeviceMotionEvent.requestPermission() } catch { /* Le comptage restera à zéro. */ }
    }
    motionHandler = (event) => {
      if (!state.running) return
      const acceleration = event.accelerationIncludingGravity
      if (!acceleration) return
      const magnitude = Math.sqrt((acceleration.x || 0) ** 2 + (acceleration.y || 0) ** 2 + (acceleration.z || 0) ** 2)
      const now = Date.now()
      if (Math.abs(magnitude - 9.81) > 2.2 && now - lastStepAt > 320) {
        state.stepsCount += 1
        lastStepAt = now
        updateMeasurements()
        saveState()
      }
    }
    window.addEventListener('devicemotion', motionHandler)
  }
}

function requestSessionLocationAccess() {
  return confirmLocationAccess({
    scope: 'session',
    description: 'Elle permet d’estimer votre distance pendant la séance.',
    details: 'Votre trace n’est pas envoyée au backend JCPMF. La localisation est facultative : les exercices restent accessibles sans elle.',
    confirmLabel: 'Activer pour cette séance',
  })
}

function stopTracking() {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId)
  if (motionHandler) window.removeEventListener('devicemotion', motionHandler)
  gpsWatchId = null
  motionHandler = null
}

function renderIntro() {
  const description = conciseSessionDescription()
  container.className = ''
  container.innerHTML = `
    <section class="card stack">
      <div><p class="eyebrow">${escapeHtml(session.seasonTitle)} · ${escapeHtml(session.weekTitle)}</p><h1>${escapeHtml(session.title)}</h1>${description ? `<p class="muted">${escapeHtml(description)}</p>` : ''}</div>
      <ol class="exercise-list">
        ${session.exercises.map((exercise) => `<li><span>${escapeHtml(exercise.title)}</span><strong>${formatMinutes(durationOf(exercise))} min</strong></li>`).join('')}
      </ol>
      <p class="muted">La localisation et le capteur de mouvement sont facultatifs. Ils servent à estimer la distance et les pas.</p>
      <button id="start-session" class="button button-large" type="button">Lancer la séance</button>
    </section>`
  document.querySelector('#start-session').addEventListener('click', startSession)
}

function timeline() {
  return session.exercises.map((exercise, index) => `
    <li class="${index < state.currentIndex ? 'done' : index === state.currentIndex ? 'current' : ''}">
      <span class="timeline-dot">${index < state.currentIndex ? '✓' : index + 1}</span>
      <span>${escapeHtml(exercise.title || labels[exerciseType(exercise)])}</span>
      <small>${formatTime(durationOf(exercise))}</small>
    </li>`).join('')
}

function renderActive() {
  const exercise = session.exercises[state.currentIndex]
  const type = exerciseType(exercise)
  const isLastExercise = state.currentIndex === session.exercises.length - 1
  container.className = 'active-session'
  container.classList.toggle('dynamic-effort-colors', isDynamicColorsEnabled())
  container.dataset.effort = type
  container.innerHTML = `
    <div class="session-top"><a href="/index.html">← Programme</a><span>${escapeHtml(session.weekTitle)} · ${escapeHtml(session.title)}</span></div>
    <div class="active-heading">
      <div><p class="eyebrow">Étape ${state.currentIndex + 1} sur ${session.exercises.length} · ${labels[type]}</p><h1>${escapeHtml(exercise.title || labels[type])}</h1></div>
      <span id="session-state" class="session-state ${state.running ? '' : 'paused'}">${state.running ? '● En cours' : 'Ⅱ En pause'}</span>
    </div>
    <p class="session-measures"><span id="distance">${state.distanceKm.toFixed(2)} km</span> · <span id="steps">${state.stepsCount} pas</span></p>
    <div class="timer-ring"><div class="timer"><span id="timer-value">${formatTime(state.remainingSeconds)}</span><small>temps restant</small></div></div>
    <div class="session-controls ${isLastExercise ? 'session-controls-last' : ''}">
      <button id="toggle-timer" class="button" type="button">${state.running ? 'Mettre en pause' : 'Reprendre'}</button>
      ${isLastExercise ? '' : '<button id="next-exercise" class="button button-ghost" type="button">Étape suivante</button>'}
    </div>
    ${isLastExercise ? '<p class="session-finish-hint">Le bilan s’ouvrira automatiquement à la fin de cette étape.</p>' : ''}
    <details class="session-timeline-details">
      <summary><span>Voir le déroulé</span><small>${state.currentIndex + 1}/${session.exercises.length}</small></summary>
      <ol class="timeline">${timeline()}</ol>
    </details>`
  document.querySelector('#toggle-timer').addEventListener('click', toggleTimer)
  document.querySelector('#next-exercise')?.addEventListener('click', nextExercise)
}

function updateTimer() {
  document.querySelector('#timer-value')?.replaceChildren(formatTime(state.remainingSeconds))
}

function updateMeasurements() {
  document.querySelector('#distance')?.replaceChildren(`${state.distanceKm.toFixed(2)} km`)
  document.querySelector('#steps')?.replaceChildren(`${state.stepsCount} pas`)
}

function startClock() {
  window.clearInterval(timerId)
  timerId = window.setInterval(() => {
    if (!state.running) return
    if (state.remainingSeconds > 0) state.remainingSeconds -= 1
    updateTimer()
    saveState()
    if (state.remainingSeconds === 0) nextExercise()
  }, 1000)
}

async function startSession() {
  if (!session.exercises.length) {
    showMessage(message, 'Cette séance ne contient aucun exercice.')
    return
  }
  const locationEnabled = await requestSessionLocationAccess()
  try {
    await api(`/runner/sessions/${sessionId}/start`, { method: 'PUT' })
    state = { currentIndex: 0, remainingSeconds: durationOf(session.exercises[0]), running: true, distanceKm: 0, stepsCount: 0, locationEnabled }
    renderActive()
    startClock()
    startTracking(true)
    playCue()
    saveState()
  } catch (error) {
    showMessage(message, error.message)
  }
}

function toggleTimer() {
  state.running = !state.running
  saveState()
  renderActive()
}

async function nextExercise() {
  if (state.currentIndex >= session.exercises.length - 1) {
    showResult()
    return
  }
  state.currentIndex += 1
  state.remainingSeconds = durationOf(session.exercises[state.currentIndex])
  saveState()
  renderActive()
  playCue()
  try {
    await api(`/runner/sessions/${sessionId}/progress`, { method: 'PATCH', body: { currentExerciseIndex: state.currentIndex } })
  } catch (error) {
    showMessage(message, error.message)
  }
}

function showResult() {
  state.running = false
  stopTracking()
  window.clearInterval(timerId)
  container.className = ''
  container.innerHTML = `
    <section class="card stack session-result-card">
      <div><p class="eyebrow">Bilan de séance</p><h1>Bravo, entraînement terminé !</h1><p class="muted">Vous pouvez maintenant enregistrer les mesures.</p></div>
      <div class="result-grid">
        <article><small>Distance parcourue</small><strong>${state.distanceKm.toFixed(2)} km</strong></article>
        <article><small>Pas estimés</small><strong>${state.stepsCount} pas</strong></article>
      </div>
      <form id="post-session-form" class="post-session-form">
        <div class="post-session-heading">
          <div><p class="eyebrow">Forme après la séance</p><h2>Comment votre corps a-t-il réagi ?</h2></div>
          <span>3 réponses rapides</span>
        </div>
        <fieldset>
          <legend>Niveau d’énergie</legend>
          <div class="quiz-scale quiz-scale-energy">
            ${[
              [1, 'Très fatigué·e', '😮‍💨'], [2, 'Fatigué·e', '😓'], [3, 'Bien', '🙂'], [4, 'En forme', '😊'], [5, 'Très en forme', '⚡'],
            ].map(([value, label, icon]) => `<label><input type="radio" name="energy" value="${value}" required><span aria-hidden="true">${icon}</span><small>${label}</small></label>`).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Effort ressenti</legend>
          <div class="quiz-scale">
            ${[
              [1, 'Très facile'], [2, 'Facile'], [3, 'Modéré'], [4, 'Difficile'], [5, 'Très difficile'],
            ].map(([value, label]) => `<label><input type="radio" name="effort" value="${value}" required><span>${value}</span><small>${label}</small></label>`).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Gêne inhabituelle</legend>
          <div class="quiz-options">
            ${[['none', 'Aucune'], ['light', 'Légère'], ['high', 'Importante']].map(([value, label]) => `<label><input type="radio" name="discomfort" value="${value}" required><span>${label}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="post-session-actions">
          <button id="save-result" class="button button-large" type="submit">Enregistrer le bilan</button>
          <button id="skip-feedback" class="text-button" type="button">Enregistrer sans répondre</button>
        </div>
        <p class="muted quiz-privacy">Vos réponses restent sur cet appareil et apparaissent dans votre export.</p>
      </form>
    </section>`
  const form = document.querySelector('#post-session-form')
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(form)
    completeSession({
      energy: Number(data.get('energy')),
      effort: Number(data.get('effort')),
      discomfort: data.get('discomfort'),
    })
  })
  document.querySelector('#skip-feedback').addEventListener('click', () => completeSession(null))
}

function recoveryMessage(wellness) {
  if (!wellness) return 'Votre bilan a bien été enregistré.'
  if (wellness.discomfort === 'high') return 'Prenez le temps de récupérer et restez attentif·ve à cette gêne avant la prochaine séance.'
  if (wellness.energy <= 2 || wellness.effort >= 5) return 'La séance a été exigeante : privilégiez une récupération douce avant le prochain entraînement.'
  if (wellness.energy >= 4 && wellness.effort <= 3) return 'Vous terminez avec de bonnes sensations. Gardez ce rythme régulier.'
  return 'Votre ressenti est enregistré. Il vous aidera à suivre votre forme séance après séance.'
}

function bindSessionShare(completion) {
  const button = document.querySelector('#share-session-summary')
  const status = document.querySelector('#share-session-status')
  if (!button || !status || !completion) return
  const prepared = prepareShareSummary({
    title: completion.title || session.title,
    completedAt: completion.completedAt,
    durationSeconds: completion.durationSeconds,
    distanceKm: completion.distanceKm,
    stats: getGamificationStats(new Date(), userId),
  })
  button.addEventListener('click', async () => {
    button.disabled = true
    button.textContent = 'Préparation…'
    status.textContent = ''
    try {
      const result = await sharePreparedSummary(prepared)
      status.textContent = result.message
      status.className = 'share-status success'
    } catch (error) {
      status.textContent = error.message || 'Le partage est indisponible sur cet appareil.'
      status.className = 'share-status error'
    } finally {
      button.disabled = false
      button.textContent = '↗ Partager mon bilan'
    }
  })
}

async function completeSession(wellness) {
  container.querySelectorAll('button').forEach((button) => { button.disabled = true })
  try {
    await api(`/runner/sessions/${sessionId}/complete`, {
      method: 'PUT',
      body: { distanceKm: Number(state.distanceKm.toFixed(2)), stepsCount: state.stepsCount },
    })
    const completion = recordSessionCompletion({
      userId,
      sessionId,
      title: session.title,
      completedAt: new Date().toISOString(),
      durationSeconds: effortDurationOf(session.exercises),
      distanceKm: Number(state.distanceKm.toFixed(2)),
      stepsCount: state.stepsCount,
      wellness,
    })
    localStorage.removeItem(storageKey())
    container.innerHTML = `<section class="card stack completion-card"><span class="completion-icon" aria-hidden="true">✓</span><p class="eyebrow">Séance enregistrée</p><h1>Votre progression est à jour.</h1><p class="muted">${escapeHtml(recoveryMessage(wellness))}</p><div class="completion-actions"><button id="share-session-summary" class="button button-large" type="button">↗ Partager mon bilan</button><a class="button button-ghost button-large" href="/index.html">Retour au programme</a></div><p id="share-session-status" class="share-status" role="status" aria-live="polite"></p></section>`
    bindSessionShare(completion)
  } catch (error) {
    showMessage(message, error.message)
    container.querySelectorAll('button').forEach((button) => { button.disabled = false })
  }
}

function renderHistory() {
  const completion = getLatestSessionCompletion(sessionId, userId)
  const wellness = completion?.wellness
  const shareCompletion = completion || {
    title: session.title,
    completedAt: session.completedAt || new Date().toISOString(),
    durationSeconds: effortDurationOf(session.exercises),
    distanceKm: Number(session.distanceKm) || 0,
  }
  const discomfortLabels = { none: 'Aucune', light: 'Légère', high: 'Importante' }
  container.className = ''
  container.innerHTML = `
    <section class="card stack">
      <div><p class="eyebrow">Séance terminée</p><h1>${escapeHtml(session.title)}</h1></div>
      <div class="result-grid">
        <article><small>Distance</small><strong>${Number(session.distanceKm || 0).toFixed(2)} km</strong></article>
        <article><small>Pas</small><strong>${Number(session.stepsCount || 0)} pas</strong></article>
      </div>
      ${wellness ? `<div class="history-wellness" aria-label="Forme après la séance"><p class="eyebrow">Votre ressenti</p><div><span>Énergie <strong>${wellness.energy}/5</strong></span><span>Effort <strong>${wellness.effort}/5</strong></span><span>Gêne <strong>${discomfortLabels[wellness.discomfort]}</strong></span></div></div>` : ''}
      <div class="completion-actions"><button id="share-session-summary" class="button" type="button">↗ Partager mon bilan</button><a class="button button-ghost" href="/index.html">Retour au programme</a></div>
      <p id="share-session-status" class="share-status" role="status" aria-live="polite"></p>
    </section>`
  bindSessionShare(shareCompletion)
}

async function load() {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    container.hidden = true
    showMessage(message, 'Identifiant de séance invalide.')
    return
  }
  const user = await requireUser()
  if (!user) return
  userId = user.id
  mountNavigation(user)
  try {
    session = await api(`/runner/sessions/${sessionId}`)
    if (session.status === 'completed') {
      renderHistory()
    } else if (session.status === 'in_progress') {
      state = restoreState() || {
        currentIndex: session.currentExerciseIndex || 0,
        remainingSeconds: durationOf(session.exercises[session.currentExerciseIndex || 0]),
        running: false,
        distanceKm: Number(session.distanceKm || 0),
        stepsCount: Number(session.stepsCount || 0),
        locationEnabled: false,
      }
      renderActive()
      startClock()
      startTracking(false)
    } else {
      renderIntro()
    }
  } catch (error) {
    container.hidden = true
    showMessage(message, error.message)
  }
}

window.addEventListener('beforeunload', () => {
  if (state) saveState()
  stopTracking()
})

window.addEventListener(APPEARANCE_EVENT, () => {
  if (container.classList.contains('active-session')) {
    container.classList.toggle('dynamic-effort-colors', isDynamicColorsEnabled())
  }
})

load()
