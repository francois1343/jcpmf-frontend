import { api } from './api.js'
import { escapeHtml, formatMinutes, mountNavigation, requireUser, showMessage } from './common.js'
import { mountEngagementDashboard } from './engagement.js'
import { syncCompletedSessions } from './gamification.js'
import { getPhysicalProfile, goalLabel } from './physical-profile.js'
import { showReminderOnboardingOnce } from './reminder-ui.js'
import { mountWeatherWidget } from './weather.js'

const dashboard = document.querySelector('#dashboard')
const message = document.querySelector('#message')
let plan = null

const statusLabels = {
  not_started: 'À faire',
  in_progress: 'En cours',
  completed: 'Terminée',
}

function sessionsWithContext() {
  return (plan?.seasons || []).flatMap((season) => season.weeks.flatMap((week) => (
    week.sessions.map((session) => ({ ...session, seasonTitle: season.title, weekTitle: week.title }))
  )))
}

function sessionRow(session, index) {
  return `
    <article class="session-row ${session.status === 'completed' ? 'completed' : ''}">
      <span class="session-step">${session.status === 'completed' ? '✓' : index + 1}</span>
      <div class="session-copy">
        <strong>${escapeHtml(session.title)}</strong>
        <small>${session.exerciseCount} exercices · ${formatMinutes(session.durationSeconds)} min ·
          <span class="status status-${session.status}">${statusLabels[session.status] || session.status}</span>
        </small>
      </div>
      <div class="session-actions">
        <a class="button button-ghost" href="/session.html?id=${encodeURIComponent(session.id)}">
          ${session.status === 'in_progress' ? 'Reprendre' : session.status === 'completed' ? 'Voir' : 'Ouvrir'}
        </a>
        ${session.status !== 'not_started' ? `<button class="reset-action" type="button" data-reset="day" data-id="${session.id}" data-label="${escapeHtml(session.title)}">↺ Réinitialiser cette journée</button>` : ''}
      </div>
    </article>`
}

function renderPlan() {
  return (plan.seasons || []).map((season) => `
    <details class="season">
      <summary class="season-summary">
        <span class="summary-title">${escapeHtml(season.title)}</span>
        <span class="summary-progress">${season.completedCount}/${season.sessionCount}</span>
      </summary>
      <div class="season-intro">
        <p>${escapeHtml(season.description || '')}</p>
        ${(season.weeks || []).some((week) => week.sessions.some((session) => session.status !== 'not_started'))
          ? `<button class="reset-action" type="button" data-reset="season" data-id="${season.id}" data-label="${escapeHtml(season.title)}">↺ Réinitialiser</button>`
          : ''}
      </div>
      ${(season.weeks || []).map((week) => `
        <details class="week">
          <summary class="week-summary">
            <span class="summary-title">${escapeHtml(week.title)}</span>
            <span class="summary-progress">${week.completedCount}/${week.sessions.length} terminées</span>
          </summary>
          ${week.sessions.some((session) => session.status !== 'not_started')
            ? `<div class="reset-row"><button class="reset-action" type="button" data-reset="week" data-id="${week.id}" data-label="${escapeHtml(week.title)}">↺ Réinitialiser</button></div>`
            : ''}
          <div class="sessions">${week.sessions.map(sessionRow).join('')}</div>
        </details>`).join('')}
    </details>`).join('')
}

function render(user) {
  const sessions = sessionsWithContext()
  const progress = plan.progress || { completed: 0, total: 0 }
  const percent = progress.total ? Math.round(progress.completed * 100 / progress.total) : 0
  const next = sessions.find((session) => session.status === 'in_progress')
    || sessions.find((session) => session.status === 'not_started')
    || sessions.at(-1)
  const minutes = Math.round(sessions.reduce((total, session) => total + Number(session.durationSeconds || 0), 0) / 60)
  const runnerProfile = getPhysicalProfile(user.id)
  const selectedGoals = runnerProfile.goals.map(goalLabel).filter(Boolean)
  const goalsSummary = selectedGoals.slice(0, 2).join(' · ')
    + (selectedGoals.length > 2 ? ` · +${selectedGoals.length - 2}` : '')
  const readyLabel = runnerProfile.gender === 'female' ? 'Prête' : runnerProfile.gender === 'male' ? 'Prêt' : 'Prêt·e'

  dashboard.className = ''
  dashboard.innerHTML = `
    <section id="weather-widget" class="weather-card card" aria-live="polite"></section>
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow">Mon programme</p>
        <h1>${readyLabel} pour votre prochaine foulée ?</h1>
        <p>Chaque séance compte.</p>
        ${goalsSummary ? `<p class="hero-goal"><span aria-hidden="true">◎</span> Mes objectifs : <strong>${escapeHtml(goalsSummary)}</strong></p>` : ''}
        ${next ? `<a class="button" href="/session.html?id=${next.id}">${next.status === 'in_progress' ? 'Reprendre la séance' : 'Lancer la prochaine séance'} →</a>` : ''}
      </div>
      <div class="progress-ring" style="--progress:${percent * 3.6}deg">
        <div class="progress-ring-inner"><strong>${percent}%</strong><small>${progress.completed} sur ${progress.total} séances</small></div>
      </div>
    </section>
    <section class="metrics">
      <article class="card metric"><strong>${progress.completed}</strong><span>Séances accomplies</span></article>
      <article class="card metric"><strong>${plan.seasons.length}</strong><span>Saisons à parcourir</span></article>
      <article class="card metric"><strong>${minutes}</strong><span>Minutes au programme</span></article>
    </section>
    <section id="programme">
      <header class="section-tools">
        <div><p class="eyebrow">Saisons · Semaines · Séances</p><h2>Mon parcours</h2></div>
      </header>
      <div class="plan">${renderPlan()}</div>
    </section>
    <section id="engagement-dashboard" class="engagement-section" aria-label="Statistiques et gamification"></section>`
  mountWeatherWidget(document.querySelector('#weather-widget'))
  mountEngagementDashboard(document.querySelector('#engagement-dashboard'), user.id)
  showReminderOnboardingOnce()
}

async function load() {
  const user = await requireUser()
  if (!user) return
  if (user.role === 'admin') {
    window.location.replace('/admin.html')
    return
  }
  mountNavigation(user)
  try {
    plan = await api('/runner/plan')
    syncCompletedSessions(plan, user.id)
    render(user)
  } catch (error) {
    dashboard.hidden = true
    showMessage(message, error.message)
  }
}

dashboard.addEventListener('click', async (event) => {
  const reset = event.target.closest('[data-reset]')
  if (!reset) return
  event.preventDefault()
  const user = JSON.parse(localStorage.getItem('jcpmf_user') || 'null')
  if (!user) return
  const scope = reset.dataset.reset
  const sessions = sessionsWithContext()
  const selectedIndex = sessions.findIndex((session) => Number(session.id) === Number(reset.dataset.id))
  const daysToReset = scope === 'day' && selectedIndex >= 0
    ? sessions.slice(selectedIndex).filter((session) => session.status !== 'not_started')
    : []
  const followingCount = Math.max(0, daysToReset.length - 1)
  const confirmation = scope === 'day'
    ? `Réinitialiser « ${reset.dataset.label} »${followingCount ? ` et ${followingCount} journée${followingCount > 1 ? 's' : ''} suivante${followingCount > 1 ? 's' : ''}` : ''} ?`
    : `Réinitialiser la progression de « ${reset.dataset.label} » ?`
  if (!window.confirm(confirmation)) return
  reset.disabled = true
  try {
    if (scope === 'day') {
      for (const session of daysToReset) {
        await api(`/runner/progress/session/${session.id}`, { method: 'DELETE' })
      }
    } else {
      await api(`/runner/progress/${scope}/${reset.dataset.id}`, { method: 'DELETE' })
    }
    plan = await api('/runner/plan')
    syncCompletedSessions(plan, user.id)
    render(user)
    showMessage(message, 'La progression et les statistiques ont été mises à jour.', 'success')
  } catch (error) {
    try {
      plan = await api('/runner/plan')
      syncCompletedSessions(plan, user.id)
      render(user)
    } catch {
      // Le message d’origine reste prioritaire si le rafraîchissement échoue aussi.
    }
    showMessage(message, error.message)
  } finally {
    if (reset.isConnected) reset.disabled = false
  }
})

load()
