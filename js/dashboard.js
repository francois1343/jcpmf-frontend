import { api } from './api.js'
import { escapeHtml, formatMinutes, mountNavigation, requireUser, showMessage } from './common.js'
import { mountEngagementDashboard } from './engagement.js'
import { syncCompletedSessions } from './gamification.js'
import { showReminderOnboardingOnce } from './reminder-ui.js'
import { mountWeatherWidget } from './weather.js'

const dashboard = document.querySelector('#dashboard')
const message = document.querySelector('#message')
let plan = null
let activeFilter = 'all'

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
  if (activeFilter !== 'all' && session.status !== activeFilter) return ''
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
        ${session.status !== 'not_started' ? `<button class="text-button" type="button" data-reset="session" data-id="${session.id}" data-label="${escapeHtml(session.title)}">Réinitialiser</button>` : ''}
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
        <button class="text-button" type="button" data-reset="season" data-id="${season.id}" data-label="${escapeHtml(season.title)}">Réinitialiser la saison</button>
      </div>
      ${(season.weeks || []).map((week) => `
        <details class="week">
          <summary class="week-summary">
            <span class="summary-title">${escapeHtml(week.title)}</span>
            <span class="summary-progress">${week.completedCount}/${week.sessions.length} terminées</span>
          </summary>
          <div class="reset-row"><button class="text-button" type="button" data-reset="week" data-id="${week.id}" data-label="${escapeHtml(week.title)}">Réinitialiser la semaine</button></div>
          <div class="sessions">${week.sessions.map(sessionRow).join('') || '<p class="loading">Aucune séance pour ce filtre.</p>'}</div>
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

  dashboard.className = ''
  dashboard.innerHTML = `
    <section id="weather-widget" class="weather-card card" aria-live="polite"></section>
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow">Votre terrain d’entraînement</p>
        <h1>Prêt·e pour la prochaine foulée,<br><span>${escapeHtml(user.username)}</span> ?</h1>
        <p>Votre programme avance avec vous. Une séance régulière vaut mieux qu’un départ trop rapide.</p>
        ${next ? `<a class="button button-large" href="/session.html?id=${next.id}">${next.status === 'in_progress' ? 'Reprendre la séance' : 'Lancer la prochaine séance'} →</a>` : ''}
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
        <div class="filters" aria-label="Filtrer les séances">
          ${[
            ['all', 'Toutes'], ['in_progress', 'En cours'], ['not_started', 'À faire'], ['completed', 'Terminées'],
          ].map(([value, label]) => `<button type="button" data-filter="${value}" class="${value === activeFilter ? 'active' : ''}">${label}</button>`).join('')}
        </div>
      </header>
      <div class="plan">${renderPlan()}</div>
    </section>
    <section id="engagement-dashboard" class="engagement-section" aria-label="Statistiques et gamification"></section>`
  mountWeatherWidget(document.querySelector('#weather-widget'))
  mountEngagementDashboard(document.querySelector('#engagement-dashboard'))
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
    syncCompletedSessions(plan)
    render(user)
  } catch (error) {
    dashboard.hidden = true
    showMessage(message, error.message)
  }
}

dashboard.addEventListener('click', async (event) => {
  const filter = event.target.closest('[data-filter]')
  if (filter) {
    activeFilter = filter.dataset.filter
    render(JSON.parse(localStorage.getItem('jcpmf_user')))
    return
  }

  const reset = event.target.closest('[data-reset]')
  if (!reset) return
  event.preventDefault()
  if (!window.confirm(`Réinitialiser la progression de « ${reset.dataset.label} » ?`)) return
  try {
    await api(`/runner/progress/${reset.dataset.reset}/${reset.dataset.id}`, { method: 'DELETE' })
    plan = await api('/runner/plan')
    render(JSON.parse(localStorage.getItem('jcpmf_user')))
  } catch (error) {
    showMessage(message, error.message)
  }
})

load()
