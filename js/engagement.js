import {
  formatAccumulatedTime,
  getGamificationStats,
  subscribeToGamification,
} from './gamification.js'

let currentTarget = null

function formatBestDay(date) {
  if (!date) return 'Aucune séance'
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00`))
}

function render() {
  if (!currentTarget?.isConnected) return
  const stats = getGamificationStats()
  currentTarget.innerHTML = `
    <div class="engagement-heading">
      <div><p class="eyebrow">Engagement &amp; gamification</p><h2>Mes statistiques locales</h2></div>
      <p>Ces données restent sur cet appareil.</p>
    </div>
    <div class="game-stats">
      <article class="card game-stat"><span class="stat-icon" aria-hidden="true">✓</span><div><strong>${stats.totalSessions}</strong><span>Séances terminées</span></div></article>
      <article class="card game-stat"><span class="stat-icon" aria-hidden="true">⏱</span><div><strong>${formatAccumulatedTime(stats.totalDurationSeconds)}</strong><span>Temps course/marche</span></div></article>
      <article class="card game-stat"><span class="stat-icon" aria-hidden="true">🔥</span><div><strong>${stats.dailyStreak} jour${stats.dailyStreak > 1 ? 's' : ''}</strong><span>Série actuelle · ${stats.weeklyStreak} semaine${stats.weeklyStreak > 1 ? 's' : ''}</span></div></article>
      <article class="card game-stat"><span class="stat-icon" aria-hidden="true">🏅</span><div><strong>${Math.round(stats.bestDay.durationSeconds / 60)} min</strong><span>Meilleure journée · ${formatBestDay(stats.bestDay.date)}</span></div></article>
    </div>`
}

subscribeToGamification(render)

export function mountEngagementDashboard(target) {
  currentTarget = target
  render()
}
