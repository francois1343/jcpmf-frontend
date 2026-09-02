function validCoordinate(coordinate) {
  return Array.isArray(coordinate)
    && coordinate.length === 2
    && Number.isFinite(Number(coordinate[0]))
    && Number.isFinite(Number(coordinate[1]))
    && Math.abs(Number(coordinate[0])) <= 90
    && Math.abs(Number(coordinate[1])) <= 180
}

export function normaliseRoute(route, index = 0) {
  if (!route || !Array.isArray(route.coordinates) || route.coordinates.length < 2 || !route.coordinates.every(validCoordinate)) {
    throw new Error(`Le parcours ${index + 1} contient des coordonnées invalides.`)
  }
  const distanceKm = Number(route.distanceKm)
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new Error(`La distance du parcours ${index + 1} est invalide.`)

  return {
    id: String(route.id || `parcours-${index + 1}`),
    titre: String(route.titre || `Parcours ${index + 1}`),
    description: String(route.description || ''),
    distanceKm,
    deniveleM: Math.max(0, Number(route.deniveleM) || 0),
    difficulte: String(route.difficulte || 'Non précisée'),
    directionDeg: Number.isFinite(Number(route.directionDeg)) ? Number(route.directionDeg) : index * 120,
    coordinates: route.coordinates.map(([latitude, longitude]) => [Number(latitude), Number(longitude)]),
  }
}

export async function loadRoutes(fetchFn = fetch) {
  const response = await fetchFn('/parcours.json', { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Impossible de charger les parcours (HTTP ${response.status}).`)
  const data = await response.json()
  if (!Array.isArray(data?.parcours) || !data.parcours.length) throw new Error('Aucun parcours n’est disponible.')
  return data.parcours.map(normaliseRoute)
}

// Distance entre deux relevés GPS selon la formule de Haversine.
export function haversineDistanceMeters(left, right) {
  const radius = 6371000
  const radians = (value) => Number(value) * Math.PI / 180
  const latitudeDelta = radians(right.latitude - left.latitude)
  const longitudeDelta = radians(right.longitude - left.longitude)
  const leftLatitude = radians(left.latitude)
  const rightLatitude = radians(right.latitude)
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function formatRunDuration(totalMilliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(totalMilliseconds) / 1000) || 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatAveragePace(elapsedMilliseconds, distanceMeters) {
  const distanceKm = Number(distanceMeters) / 1000
  if (distanceKm < 0.05) return '--:-- /km'
  const paceSeconds = Math.max(0, Number(elapsedMilliseconds) / 1000 / distanceKm)
  const minutes = Math.floor(paceSeconds / 60)
  const seconds = Math.round(paceSeconds % 60)
  const adjustedMinutes = seconds === 60 ? minutes + 1 : minutes
  const adjustedSeconds = seconds === 60 ? 0 : seconds
  return `${String(adjustedMinutes).padStart(2, '0')}:${String(adjustedSeconds).padStart(2, '0')} /km`
}

// La progression mesure le volume parcouru, plafonné à 100 % de l'itinéraire choisi.
export function routeProgress(distanceMeters, routeDistanceKm) {
  const targetMeters = Number(routeDistanceKm) * 1000
  if (!Number.isFinite(targetMeters) || targetMeters <= 0) return 0
  return Math.min(100, Math.max(0, Number(distanceMeters) * 100 / targetMeters))
}
