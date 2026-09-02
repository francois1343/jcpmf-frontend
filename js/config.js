const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
let productionApiPromise = null

function normalizedApiUrl(value) {
  const url = String(value || '').replace(/\/$/, '')
  return url.endsWith('/api') ? url : `${url}/api`
}

export async function getApiBase() {
  if (window.JCPMF_API_BASE) return normalizedApiUrl(window.JCPMF_API_BASE)
  if (isLocal) return 'http://127.0.0.1:4000/api'

  productionApiPromise ||= fetch('/api/config', { cache: 'no-store' })
    .then(async (response) => {
      const config = await response.json().catch(() => null)
      if (!response.ok || !config?.apiBase) {
        throw new Error(config?.message || 'URL du backend non configurée sur Vercel.')
      }
      return normalizedApiUrl(config.apiBase)
    })
  return productionApiPromise
}
