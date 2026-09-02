const STORAGE_KEY = 'jcpmf_gamification_v1'
const UPDATE_EVENT = 'jcpmf:gamification-updated'

function emptyData() {
  return { version: 1, completions: [] }
}

function validCompletion(item) {
  return item
    && Number.isFinite(Number(item.durationSeconds))
    && !Number.isNaN(new Date(item.completedAt).getTime())
}

export function getGamificationData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!parsed || !Array.isArray(parsed.completions)) return emptyData()
    return { version: 1, completions: parsed.completions.filter(validCompletion) }
  } catch {
    return emptyData()
  }
}

function saveGamificationData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: data }))
}

function dateKey(value) {
  const date = new Date(value)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function startOfLocalDay(value = new Date()) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function addLocalDays(value, amount) {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

function startOfWeek(value = new Date()) {
  const date = startOfLocalDay(value)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date
}

function consecutivePeriods(activeKeys, currentStart, previousStart, moveBack, keyFor) {
  let cursor = activeKeys.has(keyFor(currentStart)) ? currentStart : previousStart
  if (!activeKeys.has(keyFor(cursor))) return 0
  let streak = 0
  while (activeKeys.has(keyFor(cursor))) {
    streak += 1
    cursor = moveBack(cursor)
  }
  return streak
}

export function effortDurationOf(exercises = []) {
  return exercises
    .filter((exercise) => ['run', 'walk', 'sprint'].includes(exercise?.type))
    .reduce((total, exercise) => total + Math.max(0, Number(exercise.durationSeconds ?? exercise.duration_seconds) || 0), 0)
}

export function recordSessionCompletion(details) {
  const completedAt = details.completedAt || new Date().toISOString()
  const completion = {
    id: details.id || `local-${details.sessionId || 'session'}-${completedAt}`,
    sessionId: Number(details.sessionId) || null,
    title: String(details.title || 'Séance'),
    completedAt,
    durationSeconds: Math.max(0, Number(details.durationSeconds) || 0),
    distanceKm: Math.max(0, Number(details.distanceKm) || 0),
    stepsCount: Math.max(0, Number(details.stepsCount) || 0),
  }
  const data = getGamificationData()
  if (!data.completions.some((item) => item.id === completion.id)) {
    data.completions.push(completion)
    data.completions = data.completions.slice(-1000)
    saveGamificationData(data)
  }
  return completion
}

export function syncCompletedSessions(plan) {
  const data = getGamificationData()
  let changed = false
  for (const season of plan?.seasons || []) {
    for (const week of season.weeks || []) {
      for (const session of week.sessions || []) {
        if (session.status !== 'completed' || !session.completedAt) continue
        const completedAt = new Date(session.completedAt).getTime()
        const alreadyKnown = data.completions.some((item) => (
          Number(item.sessionId) === Number(session.id)
          && Math.abs(new Date(item.completedAt).getTime() - completedAt) < 5 * 60 * 1000
        ))
        if (alreadyKnown) continue
        data.completions.push({
          id: `import-${session.id}-${session.completedAt}`,
          sessionId: Number(session.id),
          title: session.title,
          completedAt: session.completedAt,
          durationSeconds: effortDurationOf(session.exercises),
          distanceKm: Number(session.distanceKm) || 0,
          stepsCount: Number(session.stepsCount) || 0,
        })
        changed = true
      }
    }
  }
  if (changed) {
    data.completions = data.completions.slice(-1000)
    saveGamificationData(data)
  }
  return changed
}

export function getGamificationStats(now = new Date()) {
  const completions = getGamificationData().completions
  const dailyTotals = new Map()
  const dailySessions = new Map()
  const activeDays = new Set()
  const activeWeeks = new Set()

  for (const completion of completions) {
    const day = dateKey(completion.completedAt)
    const week = dateKey(startOfWeek(completion.completedAt))
    activeDays.add(day)
    activeWeeks.add(week)
    dailyTotals.set(day, (dailyTotals.get(day) || 0) + Number(completion.durationSeconds || 0))
    dailySessions.set(day, (dailySessions.get(day) || 0) + 1)
  }

  const today = startOfLocalDay(now)
  const thisWeek = startOfWeek(now)
  const dailyStreak = consecutivePeriods(activeDays, today, addLocalDays(today, -1), (date) => addLocalDays(date, -1), dateKey)
  const weeklyStreak = consecutivePeriods(activeWeeks, thisWeek, addLocalDays(thisWeek, -7), (date) => addLocalDays(date, -7), dateKey)

  let bestDay = { date: null, durationSeconds: 0, sessions: 0 }
  for (const [date, durationSeconds] of dailyTotals) {
    if (durationSeconds > bestDay.durationSeconds) {
      bestDay = { date, durationSeconds, sessions: dailySessions.get(date) || 0 }
    }
  }

  const lastCompletionAt = completions
    .map((item) => item.completedAt)
    .sort((left, right) => new Date(right) - new Date(left))[0] || null
  const daysSinceLastSession = lastCompletionAt
    ? Math.max(0, Math.round((today - startOfLocalDay(lastCompletionAt)) / 86400000))
    : null

  return {
    totalSessions: completions.length,
    totalDurationSeconds: completions.reduce((total, item) => total + Number(item.durationSeconds || 0), 0),
    dailyStreak,
    weeklyStreak,
    bestDay,
    lastCompletionAt,
    daysSinceLastSession,
  }
}

export function formatAccumulatedTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [hours, minutes, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':')
}

export function subscribeToGamification(listener) {
  const update = () => listener(getGamificationStats())
  const storage = (event) => { if (event.key === STORAGE_KEY) update() }
  window.addEventListener(UPDATE_EVENT, update)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(UPDATE_EVENT, update)
    window.removeEventListener('storage', storage)
  }
}
