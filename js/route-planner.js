import { haversineDistanceMeters, normaliseRoute } from './routes-core.js'

const VALHALLA_ENDPOINT = 'https://valhalla1.openstreetmap.de/route'
const OSRM_FOOT_ENDPOINT = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'
const ELEVATION_ENDPOINT = 'https://api.open-meteo.com/v1/elevation'
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const GEOCODING_CACHE_KEY = 'jcpmf_geocoding_cache_v1'
const GEOCODING_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000
let lastGeocodingRequestAt = 0
let lastRoutingRequestAt = 0

function validOrigin(origin) {
  return origin
    && Number.isFinite(Number(origin.latitude))
    && Number.isFinite(Number(origin.longitude))
    && Math.abs(Number(origin.latitude)) <= 90
    && Math.abs(Number(origin.longitude)) <= 180
}

async function fetchJson(url, options = {}, fetchFn = fetch, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, { ...options, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function readGeocodingCache() {
  try {
    return JSON.parse(localStorage.getItem(GEOCODING_CACHE_KEY)) || {}
  } catch {
    return {}
  }
}

function writeGeocodingCache(cache) {
  try {
    const recentEntries = Object.entries(cache)
      .sort((left, right) => right[1].savedAt - left[1].savedAt)
      .slice(0, 20)
    localStorage.setItem(GEOCODING_CACHE_KEY, JSON.stringify(Object.fromEntries(recentEntries)))
  } catch {
    // Le calcul reste utilisable si le stockage local est plein ou désactivé.
  }
}

// Nominatim n'est interrogé qu'après l'envoi du formulaire : aucun auto-complétion.
export async function geocodeAddress(address, fetchFn = fetch) {
  const query = String(address || '').trim().replace(/\s+/g, ' ')
  if (query.length < 4) throw new Error('Indiquez une adresse suffisamment précise.')

  const cacheKey = query.toLocaleLowerCase('fr-BE')
  const cache = readGeocodingCache()
  const cached = cache[cacheKey]
  if (cached && Date.now() - cached.savedAt < GEOCODING_CACHE_MAX_AGE && validOrigin(cached)) {
    return { latitude: cached.latitude, longitude: cached.longitude, label: cached.label }
  }

  const url = new URL(NOMINATIM_ENDPOINT)
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'fr',
  })
  let data
  try {
    // Le service public Nominatim impose au maximum une requête par seconde.
    const remainingDelay = Math.max(0, 1000 - (Date.now() - lastGeocodingRequestAt))
    if (remainingDelay) await new Promise((resolve) => window.setTimeout(resolve, remainingDelay))
    lastGeocodingRequestAt = Date.now()
    data = await fetchJson(url, { headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' }, fetchFn)
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La recherche de l’adresse a pris trop de temps.')
    throw new Error('Le service de recherche d’adresse est momentanément indisponible.')
  }
  if (!Array.isArray(data) || !data.length) throw new Error('Adresse introuvable. Ajoutez la ville ou le code postal.')

  const result = {
    latitude: Number(data[0].lat),
    longitude: Number(data[0].lon),
    label: String(data[0].display_name || query),
  }
  if (!validOrigin(result)) throw new Error('Le résultat de cette adresse est invalide.')
  cache[cacheKey] = { ...result, savedAt: Date.now() }
  writeGeocodingCache(cache)
  return result
}

// Projette un point à une distance et un cap donnés sur la sphère terrestre.
export function destinationPoint(origin, distanceKm, bearingDegrees) {
  if (!validOrigin(origin)) throw new Error('Le point de départ est invalide.')
  const radiusKm = 6371
  const radians = (value) => Number(value) * Math.PI / 180
  const degrees = (value) => Number(value) * 180 / Math.PI
  const angularDistance = Number(distanceKm) / radiusKm
  const bearing = radians(bearingDegrees)
  const latitude = radians(origin.latitude)
  const longitude = radians(origin.longitude)
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const targetLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
  )
  return { latitude: degrees(targetLatitude), longitude: degrees(targetLongitude) }
}

// Trois points de passage répartis autour du départ favorisent une vraie boucle.
export function buildLoopWaypoints(origin, targetDistanceKm, directionDegrees = 0) {
  // Pour un triangle, le périmètre théorique vaut environ 5,46 fois le rayon.
  const radiusKm = Math.max(.25, Number(targetDistanceKm) / 5.46)
  return [
    { latitude: Number(origin.latitude), longitude: Number(origin.longitude) },
    destinationPoint(origin, radiusKm, directionDegrees),
    destinationPoint(origin, radiusKm, directionDegrees + 120),
    destinationPoint(origin, radiusKm, directionDegrees + 240),
    { latitude: Number(origin.latitude), longitude: Number(origin.longitude) },
  ]
}

// Décode les polylines à précision 6 renvoyées par Valhalla.
export function decodePolyline(encoded, precision = 6) {
  const coordinates = []
  const factor = 10 ** precision
  let index = 0
  let latitude = 0
  let longitude = 0
  while (index < String(encoded).length) {
    const values = []
    for (let coordinateIndex = 0; coordinateIndex < 2; coordinateIndex += 1) {
      let result = 0
      let shift = 0
      let byte
      do {
        byte = encoded.charCodeAt(index) - 63
        index += 1
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20 && index <= encoded.length)
      values.push((result & 1) ? ~(result >> 1) : result >> 1)
    }
    latitude += values[0]
    longitude += values[1]
    coordinates.push([latitude / factor, longitude / factor])
  }
  return coordinates
}

function mergeLegCoordinates(legs) {
  return legs.reduce((allCoordinates, leg) => {
    const legCoordinates = decodePolyline(leg.shape || '')
    if (allCoordinates.length && legCoordinates.length) legCoordinates.shift()
    return allCoordinates.concat(legCoordinates)
  }, [])
}

function coordinateDistanceKm(coordinates) {
  let totalMeters = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    totalMeters += haversineDistanceMeters(
      { latitude: coordinates[index - 1][0], longitude: coordinates[index - 1][1] },
      { latitude: coordinates[index][0], longitude: coordinates[index][1] },
    )
  }
  return totalMeters / 1000
}

async function requestPedestrianLoop(origin, preset, fetchFn) {
  const waypoints = buildLoopWaypoints(origin, preset.distanceKm, preset.directionDeg)
  try {
    return await requestOsrmFootLoop(waypoints, preset, fetchFn)
  } catch {
    return requestValhallaLoop(waypoints, preset, fetchFn)
  }
}

// Le serveur OSRM « foot » répond en GET : il évite le prévol CORS d'une requête JSON.
async function requestOsrmFootLoop(waypoints, preset, fetchFn) {
  const coordinates = waypoints.map((point) => `${point.longitude},${point.latitude}`).join(';')
  const url = new URL(`${OSRM_FOOT_ENDPOINT}/${coordinates}`)
  url.search = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'false',
    alternatives: 'false',
    continue_straight: 'true',
  })
  const data = await fetchJson(url, { headers: { Accept: 'application/json' } }, fetchFn, 5000)
  const route = data?.routes?.[0]
  const routeCoordinates = route?.geometry?.coordinates?.map(([longitude, latitude]) => [Number(latitude), Number(longitude)])
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) throw new Error('OSRM n’a renvoyé aucun chemin praticable.')
  const distanceKm = Number(route.distance) / 1000
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new Error('La distance OSRM est invalide.')
  return normaliseRoute({
    ...preset,
    distanceKm: Math.round(distanceKm * 10) / 10,
    deniveleM: 0,
    coordinates: routeCoordinates,
  })
}

async function requestValhallaLoop(waypoints, preset, fetchFn) {
  const payload = {
    locations: waypoints.map((point) => ({ lat: point.latitude, lon: point.longitude, type: 'break' })),
    costing: 'pedestrian',
    units: 'kilometers',
    language: 'fr-FR',
    shape_format: 'polyline6',
    directions_options: { units: 'kilometers' },
  }
  const data = await fetchJson(VALHALLA_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Client-Id': 'jcpmf.vercel.app',
    },
    body: JSON.stringify(payload),
  }, fetchFn, 5000)
  const coordinates = mergeLegCoordinates(data?.trip?.legs || [])
  if (coordinates.length < 2) throw new Error('Le calculateur n’a renvoyé aucun chemin praticable.')
  const reportedDistance = Number(data?.trip?.summary?.length)
  const distanceKm = Number.isFinite(reportedDistance) && reportedDistance > 0
    ? reportedDistance
    : coordinateDistanceKm(coordinates)
  return normaliseRoute({
    ...preset,
    distanceKm: Math.round(distanceKm * 10) / 10,
    deniveleM: 0,
    coordinates,
  })
}

function sampleCoordinates(coordinates, maximum = 24) {
  if (coordinates.length <= maximum) return coordinates
  return Array.from({ length: maximum }, (_, index) => {
    const sourceIndex = Math.round(index * (coordinates.length - 1) / (maximum - 1))
    return coordinates[sourceIndex]
  })
}

export function calculateElevationGain(elevations) {
  let gain = 0
  for (let index = 1; index < elevations.length; index += 1) {
    const previous = Number(elevations[index - 1])
    const current = Number(elevations[index])
    const difference = current - previous
    // Ignore les oscillations inférieures à 1 mètre du modèle numérique de terrain.
    if (Number.isFinite(difference) && difference >= 1) gain += difference
  }
  return Math.round(gain)
}

async function addElevationToRoutes(routes, fetchFn) {
  const samplesByRoute = routes.map((route) => sampleCoordinates(route.coordinates))
  const allSamples = samplesByRoute.flat()
  const url = new URL(ELEVATION_ENDPOINT)
  url.search = new URLSearchParams({
    latitude: allSamples.map(([latitude]) => latitude.toFixed(6)).join(','),
    longitude: allSamples.map(([, longitude]) => longitude.toFixed(6)).join(','),
  })
  const data = await fetchJson(url, { headers: { Accept: 'application/json' } }, fetchFn)
  if (!Array.isArray(data?.elevation) || data.elevation.length !== allSamples.length) {
    throw new Error('Le profil d’altitude est incomplet.')
  }
  let offset = 0
  return routes.map((route, index) => {
    const elevations = data.elevation.slice(offset, offset + samplesByRoute[index].length)
    offset += samplesByRoute[index].length
    return { ...route, deniveleM: calculateElevationGain(elevations), elevationAvailable: true }
  })
}

export async function createRecommendedRoutes(origin, presets, { fetchFn = fetch, onProgress = () => {} } = {}) {
  if (!validOrigin(origin)) throw new Error('Le point de départ est invalide.')
  const generatedRoutes = []
  // Les demandes restent séquentielles pour ménager le serveur public de démonstration.
  const requestedPresets = presets.slice(0, 3)
  for (const [index, preset] of requestedPresets.entries()) {
    try {
      const remainingDelay = Math.max(0, 1000 - (Date.now() - lastRoutingRequestAt))
      if (remainingDelay) await new Promise((resolve) => window.setTimeout(resolve, remainingDelay))
      lastRoutingRequestAt = Date.now()
      generatedRoutes.push(await requestPedestrianLoop(origin, preset, fetchFn))
      onProgress({ completed: index + 1, total: requestedPresets.length, found: generatedRoutes.length })
    } catch {
      // Un secteur peut ne contenir aucun chemin accessible ; les autres boucles restent proposées.
      onProgress({ completed: index + 1, total: requestedPresets.length, found: generatedRoutes.length })
    }
  }
  if (!generatedRoutes.length) {
    throw new Error('Aucun parcours praticable n’a pu être calculé autour de ce départ. Réessayez ou choisissez une autre adresse.')
  }
  try {
    const routesWithElevation = await addElevationToRoutes(generatedRoutes, fetchFn)
    return routesWithElevation.sort((left, right) => left.distanceKm - right.distanceKm)
  } catch {
    return generatedRoutes
      .map((route) => ({ ...route, elevationAvailable: false }))
      .sort((left, right) => left.distanceKm - right.distanceKm)
  }
}
