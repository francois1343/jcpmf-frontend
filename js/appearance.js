export const THEME_STORAGE_KEY = 'app_theme'
export const DYNAMIC_COLORS_STORAGE_KEY = 'dynamic_colors_enabled'
export const APPEARANCE_EVENT = 'jcpmf:appearance-updated'

const VALID_THEMES = new Set(['light', 'dark', 'auto'])
const systemDarkMode = window.matchMedia?.('(prefers-color-scheme: dark)')

function readStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    throw new Error('Impossible d’enregistrer ce réglage sur cet appareil.')
  }
}

export function getTheme() {
  const stored = readStorage(THEME_STORAGE_KEY)
  return VALID_THEMES.has(stored) ? stored : 'auto'
}

export function isDynamicColorsEnabled() {
  return readStorage(DYNAMIC_COLORS_STORAGE_KEY) === 'true'
}

export function getAppearancePreferences() {
  return { theme: getTheme(), dynamicColorsEnabled: isDynamicColorsEnabled() }
}

export function resolvedTheme(theme = getTheme()) {
  if (theme !== 'auto') return theme
  return systemDarkMode?.matches ? 'dark' : 'light'
}

function updateBrowserThemeColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = resolvedTheme(theme) === 'dark' ? '#101d16' : '#17683e'
}

export function applyAppearancePreferences({ notify = false } = {}) {
  const preferences = getAppearancePreferences()
  document.documentElement.dataset.theme = preferences.theme
  document.body.dataset.theme = preferences.theme
  updateBrowserThemeColor(preferences.theme)
  if (notify) window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: preferences }))
  return preferences
}

export function setTheme(theme) {
  if (!VALID_THEMES.has(theme)) throw new Error('Ce thème n’est pas disponible.')
  writeStorage(THEME_STORAGE_KEY, theme)
  return applyAppearancePreferences({ notify: true })
}

export function setDynamicColorsEnabled(enabled) {
  writeStorage(DYNAMIC_COLORS_STORAGE_KEY, String(Boolean(enabled)))
  return applyAppearancePreferences({ notify: true })
}

systemDarkMode?.addEventListener?.('change', () => {
  if (getTheme() === 'auto') applyAppearancePreferences({ notify: true })
})

window.addEventListener('storage', (event) => {
  if ([THEME_STORAGE_KEY, DYNAMIC_COLORS_STORAGE_KEY].includes(event.key)) {
    applyAppearancePreferences({ notify: true })
  }
})

applyAppearancePreferences()
