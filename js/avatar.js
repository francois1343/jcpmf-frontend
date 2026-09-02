const STORAGE_KEY = 'user_profile_avatar'
const UPDATE_EVENT = 'jcpmf:avatar-updated'
const MAX_SOURCE_SIZE = 12 * 1024 * 1024
const MAX_DIMENSION = 512
const JPEG_QUALITY = .82
const MAX_STORED_LENGTH = 1_200_000

export const PRESET_AVATARS = Object.freeze([
  { path: '/assets/avatars/avatar-man-1.svg', label: 'Homme 1' },
  { path: '/assets/avatars/avatar-man-2.svg', label: 'Homme 2' },
  { path: '/assets/avatars/avatar-woman-1.svg', label: 'Femme 1' },
  { path: '/assets/avatars/avatar-woman-2.svg', label: 'Femme 2' },
  { path: '/assets/avatars/avatar-runner-neutral.svg', label: 'Neutre 1' },
  { path: '/assets/avatars/avatar-runner-neutral-2.svg', label: 'Neutre 2' },
])
const presetPaths = new Set(PRESET_AVATARS.map((avatar) => avatar.path))

function isImageDataUrl(value) {
  return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
}

function isPresetAvatar(value) {
  return presetPaths.has(value)
}

function isAvatarSource(value) {
  return isImageDataUrl(value) || isPresetAvatar(value)
}

function initials(username = '') {
  const words = String(username).trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)[0]}` : words[0]?.slice(0, 2) || '?').toUpperCase()
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result), { once: true })
    reader.addEventListener('error', () => reject(new Error('Impossible de lire cette image.')), { once: true })
    reader.readAsDataURL(file)
  })
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('Ce format d’image ne peut pas être ouvert.')), { once: true })
    image.src = source
  })
}

async function compressDataUrl(source) {
  const image = await loadImage(source)
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('L’image sélectionnée est vide.')

  const ratio = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('La compression de l’image est indisponible.')

  context.fillStyle = '#f3f7f4'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

function announceUpdate() {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
}

export function getProfileAvatar() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isAvatarSource(stored) ? stored : null
  } catch {
    return null
  }
}

export function getSelectedPresetAvatar() {
  const selected = getProfileAvatar()
  return isPresetAvatar(selected) ? selected : null
}

export function hasProfileAvatar() {
  return Boolean(getProfileAvatar())
}

export function renderProfileAvatar(target, username, temporarySource = null) {
  if (!target) return
  target.dataset.avatarUsername = username || ''
  const source = isAvatarSource(temporarySource) ? temporarySource : getProfileAvatar()
  target.replaceChildren()

  if (source) {
    const image = document.createElement('img')
    image.src = source
    image.alt = ''
    target.append(image)
    target.classList.add('has-photo')
    return
  }

  const placeholder = document.createElement('span')
  placeholder.className = 'avatar-initials'
  placeholder.textContent = initials(username)
  target.append(placeholder)
  target.classList.remove('has-photo')
}

export function selectPresetAvatar(path) {
  if (!isPresetAvatar(path)) throw new Error('Cet avatar prédéfini est invalide.')
  try {
    localStorage.setItem(STORAGE_KEY, path)
  } catch (error) {
    if (error?.name === 'QuotaExceededError') throw new Error('Le stockage local est plein.')
    throw new Error('Cet avatar ne peut pas être enregistré sur cet appareil.')
  }
  announceUpdate()
  return path
}

export async function saveProfileAvatar(file, { onPreview } = {}) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    throw new Error('Choisissez un fichier image valide.')
  }
  if (file.size > MAX_SOURCE_SIZE) {
    throw new Error('Cette image est trop volumineuse. La taille maximale est de 12 Mo.')
  }

  const source = await readFileAsDataUrl(file)
  if (!isImageDataUrl(source)) throw new Error('Le fichier sélectionné n’est pas une image valide.')
  onPreview?.(source)
  const compressed = await compressDataUrl(source)
  if (compressed.length > MAX_STORED_LENGTH) {
    throw new Error('L’image reste trop volumineuse après compression. Essayez une autre photo.')
  }

  try {
    localStorage.setItem(STORAGE_KEY, compressed)
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      throw new Error('Le stockage local est plein. Libérez de l’espace puis réessayez.')
    }
    throw new Error('La photo ne peut pas être enregistrée sur cet appareil.')
  }
  announceUpdate()
  return compressed
}

export function removeProfileAvatar() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    throw new Error('La photo ne peut pas être supprimée sur cet appareil.')
  }
  announceUpdate()
}

function renderEveryAvatar() {
  document.querySelectorAll('[data-user-avatar]').forEach((target) => {
    renderProfileAvatar(target, target.dataset.avatarUsername)
  })
}

window.addEventListener(UPDATE_EVENT, renderEveryAvatar)
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) renderEveryAvatar()
})
