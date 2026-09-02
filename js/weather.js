const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

export const DEFAULT_WEATHER_LOCATION = {
  latitude: 50.8503,
  longitude: 4.3517,
  label: 'Bruxelles',
  isFallback: true,
}

let weatherRequest = null
let cachedWeather = null

const WEATHER_GROUPS = [
  { codes: [0], day: ['Ciel dégagé', '☀️'], night: ['Nuit dégagée', '🌙'] },
  { codes: [1, 2], day: ['Éclaircies', '🌤️'], night: ['Quelques nuages', '☁️'] },
  { codes: [3], day: ['Ciel couvert', '☁️'], night: ['Ciel couvert', '☁️'] },
  { codes: [45, 48], day: ['Brouillard', '🌫️'], night: ['Brouillard', '🌫️'] },
  { codes: [51, 53, 55, 56, 57], day: ['Bruine', '🌦️'], night: ['Bruine', '🌧️'] },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], day: ['Pluie', '🌧️'], night: ['Pluie', '🌧️'] },
  { codes: [71, 73, 75, 77, 85, 86], day: ['Neige', '🌨️'], night: ['Neige', '🌨️'] },
  { codes: [95, 96, 99], day: ['Orage', '⛈️'], night: ['Orage', '⛈️'] },
]

export function describeWeather(code, isDay = true) {
  const group = WEATHER_GROUPS.find((item) => item.codes.includes(Number(code)))
  const [label, icon] = group ? (isDay ? group.day : group.night) : ['Conditions variables', '🌡️']
  return { label, icon }
}

export function getRunningAdvice(weather) {
  const code = Number(weather.weather_code)
  const temperature = Number(weather.temperature_2m)
  const apparent = Number(weather.apparent_temperature)
  const precipitation = Number(weather.precipitation)
  const wind = Number(weather.wind_speed_10m)
  const gusts = Number(weather.wind_gusts_10m)

  if ([95, 96, 99].includes(code)) return 'Orage en cours : reportez votre sortie ⛈️'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Neige et sol glissant : privilégiez un parcours sûr ❄️'
  if (gusts >= 50 || wind >= 35) return 'Vent fort : courez à l’abri et adaptez votre allure 🌬️'
  if (precipitation >= 0.3 || [61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Pluie : prévoyez une couche légère et restez visible 🌧️'
  if (code === 45 || code === 48) return 'Brouillard : choisissez un parcours visible et éclairé 🌫️'
  if (temperature >= 28 || apparent >= 30) return 'Chaleur : hydratez-vous et réduisez l’intensité ☀️'
  if (temperature <= 2 || apparent <= 0) return 'Froid : échauffez-vous progressivement et couvrez-vous 🧤'
  if (temperature >= 22 && Number(weather.is_day) === 1) return 'Temps doux : pensez à vous hydrater régulièrement 💧'
  return 'Conditions agréables : une belle occasion de courir 🏃'
}

export function locateUser(geolocation = globalThis.navigator?.geolocation) {
  if (!geolocation) return Promise.resolve({ ...DEFAULT_WEATHER_LOCATION })

  return new Promise((resolve) => {
    geolocation.getCurrentPosition((position) => {
      const latitude = Number(position.coords?.latitude)
      const longitude = Number(position.coords?.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        resolve({ ...DEFAULT_WEATHER_LOCATION })
        return
      }
      resolve({ latitude, longitude, label: 'Votre position', isFallback: false })
    }, () => resolve({ ...DEFAULT_WEATHER_LOCATION }), {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 8000,
    })
  })
}

export async function fetchCurrentWeather(location, { fetchFn = fetch, timeoutMs = 9000 } = {}) {
  const parameters = new URLSearchParams({
    latitude: Number(location.latitude).toFixed(4),
    longitude: Number(location.longitude).toFixed(4),
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    timezone: 'auto',
    forecast_days: '1',
  })
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchFn(`${OPEN_METEO_ENDPOINT}?${parameters}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Erreur météo HTTP ${response.status}`)
    const data = await response.json()
    if (!data?.current || !Number.isFinite(Number(data.current.temperature_2m))) {
      throw new Error('Les données météo reçues sont incomplètes.')
    }
    return { ...data.current, units: data.current_units || {}, location }
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function loadWeather(force = false) {
  if (!force && cachedWeather) return cachedWeather
  if (!force && weatherRequest) return weatherRequest
  weatherRequest = locateUser()
    .then((location) => fetchCurrentWeather(location))
    .then((weather) => {
      cachedWeather = weather
      return weather
    })
    .finally(() => { weatherRequest = null })
  return weatherRequest
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('fr-BE', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value) || 0)
}

function renderLoading(target) {
  target.setAttribute('aria-busy', 'true')
  target.innerHTML = `
    <span class="weather-icon weather-loading" aria-hidden="true">···</span>
    <div class="weather-copy"><p class="eyebrow">Météo pour courir</p><h2>Recherche des conditions actuelles…</h2><p class="muted">Votre position approximative sert à interroger Open-Meteo ; sinon Bruxelles sera utilisée.</p></div>`
}

function renderWeather(target, weather) {
  const condition = describeWeather(weather.weather_code, Number(weather.is_day) === 1)
  const fallbackLabel = weather.location.isFallback ? ' · position de repli' : ''
  target.removeAttribute('aria-busy')
  target.innerHTML = `
    <span class="weather-icon" aria-hidden="true">${condition.icon}</span>
    <div class="weather-copy">
      <p class="eyebrow">Météo pour courir · ${weather.location.label}${fallbackLabel}</p>
      <div class="weather-current"><strong>${formatNumber(weather.temperature_2m)}°</strong><h2>${condition.label}</h2></div>
      <div class="weather-details" aria-label="Détails météo">
        <span>Ressenti ${formatNumber(weather.apparent_temperature)}°</span>
        <span>Vent ${formatNumber(weather.wind_speed_10m)} km/h</span>
        <span>Rafales ${formatNumber(weather.wind_gusts_10m)} km/h</span>
      </div>
    </div>
    <button class="weather-refresh" type="button" data-weather-refresh aria-label="Actualiser la météo">↻ <span>Actualiser</span></button>
    <p class="weather-advice">${getRunningAdvice(weather)}</p>
    <a class="weather-source" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Données Open-Meteo</a>`
}

function renderError(target) {
  target.removeAttribute('aria-busy')
  target.innerHTML = `
    <span class="weather-icon" aria-hidden="true">🌡️</span>
    <div class="weather-copy"><p class="eyebrow">Météo pour courir</p><h2>Météo temporairement indisponible</h2><p class="muted">Vérifiez votre connexion puis réessayez.</p></div>
    <button class="weather-refresh" type="button" data-weather-refresh>↻ <span>Réessayer</span></button>`
}

export function mountWeatherWidget(target) {
  if (!target) return

  const update = async (force = false) => {
    renderLoading(target)
    try {
      renderWeather(target, await loadWeather(force))
    } catch {
      renderError(target)
    }
  }

  target.addEventListener('click', (event) => {
    if (event.target.closest('[data-weather-refresh]')) update(true)
  })
  update()
}
