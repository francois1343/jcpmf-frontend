import { api } from './api.js'
import { APPEARANCE_EVENT, isDynamicColorsEnabled } from './appearance.js'
import { escapeHtml, formatMinutes, formatTime, mountNavigation, requireUser, showMessage } from './common.js'
import { effortDurationOf, recordSessionCompletion } from './gamification.js'

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

function durationOf(exercise) {
  return Number(exercise?.durationSeconds ?? exercise?.duration_seconds ?? 0)
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

  if ('geolocation' in navigator && gpsWatchId === null) {
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

function stopTracking() {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId)
  if (motionHandler) window.removeEventListener('devicemotion', motionHandler)
  gpsWatchId = null
  motionHandler = null
}

function renderIntro() {
  container.className = ''
  container.innerHTML = `
    <section class="card stack">
      <div><p class="eyebrow">${escapeHtml(session.seasonTitle)} · ${escapeHtml(session.weekTitle)}</p><h1>${escapeHtml(session.title)}</h1><p class="muted">${escapeHtml(session.description || '')}</p></div>
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
  container.className = 'active-session'
  container.classList.toggle('dynamic-effort-colors', isDynamicColorsEnabled())
  container.dataset.effort = type
  container.innerHTML = `
    <div class="session-top"><a href="/index.html">← Programme</a><span>${escapeHtml(session.weekTitle)} · ${escapeHtml(session.title)}</span></div>
    <div class="active-heading">
      <div><p class="eyebrow">${labels[type]}</p><h1>${escapeHtml(exercise.title || labels[type])}</h1><p>Exercice ${state.currentIndex + 1} sur ${session.exercises.length}</p></div>
      <span id="session-state" class="session-state ${state.running ? '' : 'paused'}">${state.running ? '● En cours' : 'Ⅱ En pause'}</span>
    </div>
    <p class="cue">Consigne : ${labels[type]}</p>
    <p class="muted" style="color:rgb(255 255 255 / 70%)"><span id="distance">${state.distanceKm.toFixed(2)} km</span> · <span id="steps">${state.stepsCount} pas</span></p>
    <div class="timer-ring"><div class="timer"><span id="timer-value">${formatTime(state.remainingSeconds)}</span><small>temps restant</small></div></div>
    <div class="session-controls">
      <button id="toggle-timer" class="button" type="button">${state.running ? 'Mettre en pause' : 'Reprendre'}</button>
      <button id="next-exercise" class="button button-ghost" type="button">${state.currentIndex === session.exercises.length - 1 ? 'Terminer la séance' : 'Exercice suivant'}</button>
    </div>
    <button id="repeat-cue" class="text-button repeat" type="button">Répéter la consigne</button>
    <button id="finish-session" class="text-button" style="color:#d6f5e1;width:100%;margin-top:1rem" type="button">Passer au bilan</button>
    <ol class="timeline">${timeline()}</ol>`
  document.querySelector('#toggle-timer').addEventListener('click', toggleTimer)
  document.querySelector('#next-exercise').addEventListener('click', nextExercise)
  document.querySelector('#repeat-cue').addEventListener('click', playCue)
  document.querySelector('#finish-session').addEventListener('click', showResult)
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
  try {
    await api(`/runner/sessions/${sessionId}/start`, { method: 'PUT' })
    state = { currentIndex: 0, remainingSeconds: durationOf(session.exercises[0]), running: true, distanceKm: 0, stepsCount: 0 }
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
    <section class="card stack">
      <div><p class="eyebrow">Bilan de séance</p><h1>Bravo, entraînement terminé !</h1><p class="muted">Vous pouvez maintenant enregistrer les mesures.</p></div>
      <div class="result-grid">
        <article><small>Distance parcourue</small><strong>${state.distanceKm.toFixed(2)} km</strong></article>
        <article><small>Pas estimés</small><strong>${state.stepsCount} pas</strong></article>
      </div>
      <button id="save-result" class="button button-large" type="button">Enregistrer le bilan</button>
    </section>`
  document.querySelector('#save-result').addEventListener('click', completeSession)
}

async function completeSession() {
  try {
    await api(`/runner/sessions/${sessionId}/complete`, {
      method: 'PUT',
      body: { distanceKm: Number(state.distanceKm.toFixed(2)), stepsCount: state.stepsCount },
    })
    recordSessionCompletion({
      sessionId,
      title: session.title,
      completedAt: new Date().toISOString(),
      durationSeconds: effortDurationOf(session.exercises),
      distanceKm: Number(state.distanceKm.toFixed(2)),
      stepsCount: state.stepsCount,
    })
    localStorage.removeItem(storageKey())
    container.innerHTML = `<section class="card stack"><p class="eyebrow">Séance enregistrée</p><h1>Votre progression est à jour.</h1><a class="button button-large" href="/index.html">Retour au programme</a></section>`
  } catch (error) {
    showMessage(message, error.message)
  }
}

function renderHistory() {
  container.className = ''
  container.innerHTML = `
    <section class="card stack">
      <div><p class="eyebrow">Séance terminée</p><h1>${escapeHtml(session.title)}</h1></div>
      <div class="result-grid">
        <article><small>Distance</small><strong>${Number(session.distanceKm || 0).toFixed(2)} km</strong></article>
        <article><small>Pas</small><strong>${Number(session.stepsCount || 0)} pas</strong></article>
      </div>
      <a class="button" href="/index.html">Retour au programme</a>
    </section>`
}

async function load() {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    container.hidden = true
    showMessage(message, 'Identifiant de séance invalide.')
    return
  }
  const user = await requireUser()
  if (!user) return
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
