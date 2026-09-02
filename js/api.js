import { getApiBase } from './config.js'

const TOKEN_KEY = 'jcpmf_token'
const USER_KEY = 'jcpmf_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function saveSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  let response
  try {
    const apiBase = await getApiBase()
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      body: options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
    })
  } catch (error) {
    const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    const productionMessage = error instanceof TypeError
      ? 'Le backend en ligne est inaccessible. Vérifiez son URL HTTPS et sa configuration CORS.'
      : error.message
    throw new Error(local
      ? 'Le backend local est inaccessible. Vérifiez qu’il tourne sur le port 4000.'
      : productionMessage)
  }

  const data = response.status === 204
    ? null
    : await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401) clearSession()
    throw new Error(data?.message || `Erreur HTTP ${response.status}`)
  }
  return data
}

export async function login(identifier, password) {
  const data = await api('/auth/login', { method: 'POST', body: { identifier, password } })
  saveSession(data)
  return data.user
}

export async function register(username, email, password) {
  const data = await api('/auth/register', { method: 'POST', body: { username, email, password } })
  saveSession(data)
  return data.user
}

export async function currentUser() {
  const user = await api('/auth/me')
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}
