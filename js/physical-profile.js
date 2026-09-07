const STORAGE_PREFIX = 'jcpmf_physical_profile_v1'

export const PHYSICAL_GOALS = [
  { value: 'start', label: 'Commencer ou reprendre' },
  { value: 'regularity', label: 'Installer une routine' },
  { value: 'endurance', label: 'Développer mon endurance' },
  { value: 'performance', label: 'Améliorer mes performances' },
]

const VALID_GOALS = new Set(PHYSICAL_GOALS.map((goal) => goal.value))
const VALID_GENDERS = new Set(['female', 'male'])

function storageKey(userId) {
  const identifier = String(userId ?? '').trim()
  if (!identifier) throw new Error('Utilisateur invalide.')
  return `${STORAGE_PREFIX}:${identifier}`
}

function nullableNumber(value) {
  return value === '' || value == null ? null : Number(value)
}

function normalizeProfile(profile = {}) {
  const age = nullableNumber(profile.age)
  const weightKg = nullableNumber(profile.weightKg)
  const goals = Array.isArray(profile.goals)
    ? [...new Set(profile.goals.filter((goal) => VALID_GOALS.has(goal)))]
    : []

  return {
    age: Number.isInteger(age) && age >= 10 && age <= 100 ? age : null,
    weightKg: Number.isFinite(weightKg) && weightKg >= 25 && weightKg <= 300
      ? Math.round(weightKg * 10) / 10
      : null,
    gender: VALID_GENDERS.has(profile.gender) ? profile.gender : '',
    goals,
    updatedAt: profile.updatedAt || null,
  }
}

export function getPhysicalProfile(userId, storage = localStorage) {
  try {
    return normalizeProfile(JSON.parse(storage.getItem(storageKey(userId)) || 'null') || {})
  } catch {
    return normalizeProfile()
  }
}

export function savePhysicalProfile(userId, profile, storage = localStorage) {
  const rawAge = nullableNumber(profile.age)
  const rawWeight = nullableNumber(profile.weightKg)

  if (rawAge !== null && (!Number.isInteger(rawAge) || rawAge < 10 || rawAge > 100)) {
    throw new Error('L’âge doit être compris entre 10 et 100 ans.')
  }
  if (rawWeight !== null && (!Number.isFinite(rawWeight) || rawWeight < 25 || rawWeight > 300)) {
    throw new Error('Le poids doit être compris entre 25 et 300 kg.')
  }

  const normalized = normalizeProfile({
    ...profile,
    updatedAt: new Date().toISOString(),
  })
  storage.setItem(storageKey(userId), JSON.stringify(normalized))
  return normalized
}

export function removePhysicalProfile(userId, storage = localStorage) {
  storage.removeItem(storageKey(userId))
}

export function goalLabel(value) {
  return PHYSICAL_GOALS.find((goal) => goal.value === value)?.label || ''
}
