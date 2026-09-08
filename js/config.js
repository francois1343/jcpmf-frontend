// Adresse de l'API fournie par /api/config, depuis le .env local ou Vercel.
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const LOCAL_BACKEND_PORT = 4000
const VERCEL_CONFIG_ENDPOINT = '/api/config'
let apiBasePromise = null

function normalizedApiUrl(value) {
  const url = String(value || '').replace(/\/$/, '')
  return url.endsWith('/api') ? url : `${url}/api`
}

export async function getApiBase() {
  // Utile pour un test ponctuel depuis la console ou une page intégratrice.
  if (window.JCPMF_API_BASE) return normalizedApiUrl(window.JCPMF_API_BASE)

  apiBasePromise ||= fetch(VERCEL_CONFIG_ENDPOINT, { cache: 'no-store' })
    .then(async (response) => {
      const config = await response.json().catch(() => null)
      if (!response.ok || !config?.apiBase) {
        throw new Error(config?.message || 'URL du backend non configurée sur Vercel.')
      }
      return normalizedApiUrl(config.apiBase)
    })
    .catch((error) => {
      if (!isLocal && window.location.protocol !== 'http:') throw error
      return `http://${window.location.hostname}:${LOCAL_BACKEND_PORT}/api`
    })
  return apiBasePromise
}
