export const DEMO_TOKEN = 'jcpmf-local-demo-session'
export const DEMO_USER = Object.freeze({
  id: 900001,
  username: 'Démo',
  email: 'demo@jcpmf.local',
  role: 'runner',
  demo: true,
})

const PROGRESS_KEY = 'jcpmf_demo_progress_v1'
let programPromise = null

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function byPosition(left, right) {
  return Number(left.position) - Number(right.position) || Number(left.id) - Number(right.id)
}

async function loadProgram() {
  programPromise ||= fetch('/demo-program.json')
    .then((response) => {
      if (!response.ok) throw new Error('Le programme de démonstration est indisponible.')
      return response.json()
    })
  return programPromise
}

function readProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch {
    return {}
  }
}

function writeProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
}

function sessionView(program, session, progress) {
  const exercises = program.exercises
    .filter((exercise) => Number(exercise.trainingSessionId) === Number(session.id))
    .sort(byPosition)
  const saved = progress[session.id] || {}
  return {
    ...session,
    exerciseCount: exercises.length,
    durationSeconds: exercises.reduce((total, exercise) => total + Number(exercise.durationSeconds || 0), 0),
    status: saved.status || 'not_started',
    currentExerciseIndex: Number(saved.currentExerciseIndex) || 0,
    distanceKm: saved.distanceKm ?? null,
    stepsCount: saved.stepsCount ?? null,
    startedAt: saved.startedAt ?? null,
    completedAt: saved.completedAt ?? null,
    exercises,
  }
}

function buildPlan(program) {
  const progress = readProgress()
  const seasons = [...program.seasons].sort(byPosition).map((season) => {
    const weeks = program.weeks
      .filter((week) => Number(week.seasonId) === Number(season.id))
      .sort(byPosition)
      .map((week) => {
        const sessions = program.sessions
          .filter((session) => Number(session.weekId) === Number(week.id))
          .sort(byPosition)
          .map((session) => sessionView(program, session, progress))
        return { ...week, sessions, completedCount: sessions.filter((session) => session.status === 'completed').length }
      })
    const sessions = weeks.flatMap((week) => week.sessions)
    return {
      ...season,
      weeks,
      completedCount: sessions.filter((session) => session.status === 'completed').length,
      sessionCount: sessions.length,
    }
  })
  const sessions = seasons.flatMap((season) => season.weeks.flatMap((week) => week.sessions))
  return {
    seasons,
    progress: {
      completed: sessions.filter((session) => session.status === 'completed').length,
      total: sessions.length,
    },
  }
}

function sessionContext(program, sessionId) {
  const session = program.sessions.find((item) => Number(item.id) === sessionId)
  if (!session) throw new Error('Séance de démonstration introuvable.')
  const week = program.weeks.find((item) => Number(item.id) === Number(session.weekId))
  const season = program.seasons.find((item) => Number(item.id) === Number(week?.seasonId))
  return { session, week, season }
}

function updateSessionProgress(sessionId, changes) {
  const progress = readProgress()
  progress[sessionId] = { ...(progress[sessionId] || {}), ...changes, updatedAt: new Date().toISOString() }
  writeProgress(progress)
  return progress[sessionId]
}

function resetProgress(program, scope, identifier) {
  const progress = readProgress()
  let sessionIds
  if (scope === 'all') sessionIds = Object.keys(progress).map(Number)
  else if (scope === 'session') sessionIds = [identifier]
  else if (scope === 'week') {
    sessionIds = program.sessions.filter((session) => Number(session.weekId) === identifier).map((session) => Number(session.id))
  } else {
    const weekIds = program.weeks.filter((week) => Number(week.seasonId) === identifier).map((week) => Number(week.id))
    sessionIds = program.sessions.filter((session) => weekIds.includes(Number(session.weekId))).map((session) => Number(session.id))
  }
  let affectedRows = 0
  sessionIds.forEach((sessionId) => {
    if (progress[sessionId]) {
      delete progress[sessionId]
      affectedRows += 1
    }
  })
  writeProgress(progress)
  return { reset: true, affectedRows }
}

export async function demoApi(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (path === '/auth/me' && method === 'GET') return clone(DEMO_USER)

  const program = await loadProgram()
  if (path === '/runner/plan' && method === 'GET') return buildPlan(program)

  const sessionMatch = path.match(/^\/runner\/sessions\/(\d+)(?:\/(start|progress|complete))?$/)
  if (sessionMatch) {
    const sessionId = Number(sessionMatch[1])
    const action = sessionMatch[2] || ''
    const { session, week, season } = sessionContext(program, sessionId)
    if (!action && method === 'GET') {
      return {
        ...sessionView(program, session, readProgress()),
        weekTitle: week?.title || '',
        seasonTitle: season?.title || '',
      }
    }
    if (action === 'start' && method === 'PUT') {
      const now = new Date().toISOString()
      updateSessionProgress(sessionId, {
        status: 'in_progress', currentExerciseIndex: 0, distanceKm: null,
        stepsCount: null, startedAt: now, completedAt: null,
      })
      return { id: sessionId, status: 'in_progress', currentExerciseIndex: 0 }
    }
    if (action === 'progress' && method === 'PATCH') {
      updateSessionProgress(sessionId, { currentExerciseIndex: Math.max(0, Number(options.body?.currentExerciseIndex) || 0) })
      return null
    }
    if (action === 'complete' && method === 'PUT') {
      const completedAt = new Date().toISOString()
      const distanceKm = Math.max(0, Number(options.body?.distanceKm) || 0)
      const stepsCount = Math.max(0, Math.round(Number(options.body?.stepsCount) || 0))
      updateSessionProgress(sessionId, { status: 'completed', distanceKm, stepsCount, completedAt })
      return { status: 'completed', distanceKm, stepsCount }
    }
  }

  const resetMatch = path.match(/^\/runner\/progress\/(all|session|week|season)(?:\/(\d+))?$/)
  if (resetMatch && method === 'DELETE') {
    return resetProgress(program, resetMatch[1], Number(resetMatch[2]) || null)
  }

  throw new Error('Cette action n’est pas disponible en mode démo.')
}
