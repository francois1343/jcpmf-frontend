import { api } from './api.js'
import { escapeHtml, mountNavigation, requireUser, showMessage } from './common.js'
import { exportLocalStorageJson } from './data-export.js'

const content = document.querySelector('#admin-content')
const message = document.querySelector('#message')
let data = { seasons: [], weeks: [], sessions: [], exercises: [], users: [] }
let section = 'content'
let resource = 'seasons'
let editingId = null

const definitions = {
  seasons: {
    label: 'Saisons',
    columns: [['title', 'Titre'], ['position', 'Position']],
    fields: [['title', 'Titre', 'text'], ['description', 'Description', 'textarea'], ['position', 'Position', 'number']],
  },
  weeks: {
    label: 'Semaines',
    columns: [['seasonTitle', 'Saison'], ['title', 'Titre'], ['position', 'Position']],
    fields: [['seasonId', 'Saison', 'season'], ['title', 'Titre', 'text'], ['position', 'Position', 'number']],
  },
  sessions: {
    label: 'Séances',
    columns: [['weekTitle', 'Semaine'], ['title', 'Titre'], ['position', 'Position']],
    fields: [['weekId', 'Semaine', 'week'], ['title', 'Titre', 'text'], ['description', 'Description', 'textarea'], ['position', 'Position', 'number']],
  },
  exercises: {
    label: 'Exercices',
    columns: [['sessionTitle', 'Séance'], ['title', 'Titre'], ['type', 'Type'], ['durationSeconds', 'Durée'], ['position', 'Position']],
    fields: [['trainingSessionId', 'Séance', 'session'], ['title', 'Titre', 'text'], ['type', 'Type', 'exerciseType'], ['durationSeconds', 'Durée (secondes)', 'number'], ['position', 'Position', 'number']],
  },
}

const exerciseTypes = [
  ['warmup', 'Échauffement'], ['run', 'Course'], ['walk', 'Marche'],
  ['sprint', 'Sprint'], ['stretching', 'Étirements'], ['other', 'Autre'],
]

function optionsFor(type) {
  if (type === 'season') return data.seasons.map((item) => [item.id, item.title])
  if (type === 'week') return data.weeks.map((item) => [item.id, `${item.seasonTitle} — ${item.title}`])
  if (type === 'session') return data.sessions.map((item) => [item.id, `${item.weekTitle} — ${item.title}`])
  if (type === 'exerciseType') return exerciseTypes
  return []
}

function fieldControl([key, label, type], row = {}) {
  const value = row[key] ?? (type === 'number' ? 1 : '')
  if (type === 'textarea') {
    return `<label>${label}<textarea name="${key}" rows="4">${escapeHtml(value)}</textarea></label>`
  }
  if (['season', 'week', 'session', 'exerciseType'].includes(type)) {
    return `<label>${label}<select name="${key}" required><option value="">Sélectionner</option>${optionsFor(type).map(([optionValue, optionLabel]) => (
      `<option value="${optionValue}" ${String(optionValue) === String(value) ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`
    )).join('')}</select></label>`
  }
  return `<label>${label}<input name="${key}" type="${type}" value="${escapeHtml(value)}" ${type === 'number' ? 'min="0"' : ''} ${key === 'description' ? '' : 'required'}></label>`
}

function renderTable(rows, columns, actions = true) {
  if (!rows.length) return '<p class="muted">Aucun élément.</p>'
  return `<div class="table-wrap"><table><thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join('')}${actions ? '<th>Actions</th>' : ''}</tr></thead><tbody>${rows.map((row) => `
    <tr>${columns.map(([key]) => `<td>${escapeHtml(row[key] ?? '—')}</td>`).join('')}${actions ? `<td class="table-actions"><button class="text-button" type="button" data-edit="${row.id}">Modifier</button><button class="text-button" type="button" data-delete="${row.id}">Supprimer</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
}

function renderContent() {
  const definition = definitions[resource]
  const row = editingId ? data[resource].find((item) => item.id === editingId) || {} : {}
  content.innerHTML = `
    <div class="tabs" aria-label="Types de contenu">${Object.entries(definitions).map(([key, item]) => `<button class="${key === resource ? 'active' : ''}" type="button" data-resource="${key}">${item.label}</button>`).join('')}</div>
    <section class="admin-grid">
      <form id="content-form" class="card stack admin-form">
        <h2>${editingId ? 'Modifier' : 'Créer'} · ${definition.label}</h2>
        ${definition.fields.map((field) => fieldControl(field, row)).join('')}
        <div class="row"><button class="button" type="submit">${editingId ? 'Enregistrer' : 'Créer'}</button>${editingId ? '<button class="button button-ghost" type="button" data-cancel>Annuler</button>' : ''}</div>
      </form>
      <section class="card"><h2>${definition.label}</h2>${renderTable(data[resource], definition.columns)}</section>
    </section>`
}

function renderUsers() {
  const columns = [['username', 'Utilisateur'], ['email', 'E-mail'], ['completedSessions', 'Séances terminées'], ['progressPercent', 'Progression (%)']]
  content.innerHTML = `<section class="card"><h2>Coureurs inscrits</h2>${renderTable(data.users, columns, false).replaceAll('<tr>', '<tr class="user-row">')}</section><section id="user-detail"></section>`
  content.querySelectorAll('tbody tr').forEach((row, index) => {
    row.dataset.user = data.users[index].id
    row.style.cursor = 'pointer'
    row.title = 'Voir la progression'
  })
}

function render() {
  document.querySelectorAll('[data-section]').forEach((button) => button.classList.toggle('active', button.dataset.section === section))
  if (section === 'content') renderContent()
  else renderUsers()
}

async function loadData() {
  showMessage(message, '')
  content.innerHTML = '<p class="loading">Chargement…</p>'
  try {
    const [seasons, weeks, sessions, exercises, users] = await Promise.all([
      api('/admin/content/seasons'), api('/admin/content/weeks'), api('/admin/content/sessions'),
      api('/admin/content/exercises'), api('/admin/users'),
    ])
    data = { seasons, weeks, sessions, exercises, users }
    render()
  } catch (error) {
    showMessage(message, error.message)
  }
}

document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
  section = button.dataset.section
  editingId = null
  render()
}))

document.querySelector('#refresh').addEventListener('click', loadData)
document.querySelector('#export-json').addEventListener('click', (event) => {
  event.currentTarget.disabled = true
  try {
    const result = exportLocalStorageJson()
    showMessage(message, `Sauvegarde créée : ${result.filename} (${result.count} élément${result.count > 1 ? 's' : ''}). Gardez ce fichier privé.`, 'success')
  } catch (error) {
    showMessage(message, error.message)
  } finally {
    event.currentTarget.disabled = false
  }
})

content.addEventListener('click', async (event) => {
  const resourceButton = event.target.closest('[data-resource]')
  if (resourceButton) {
    resource = resourceButton.dataset.resource
    editingId = null
    renderContent()
    return
  }
  if (event.target.closest('[data-cancel]')) {
    editingId = null
    renderContent()
    return
  }
  const editButton = event.target.closest('[data-edit]')
  if (editButton) {
    editingId = Number(editButton.dataset.edit)
    renderContent()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const deleteButton = event.target.closest('[data-delete]')
  if (deleteButton) {
    const row = data[resource].find((item) => item.id === Number(deleteButton.dataset.delete))
    if (!window.confirm(`Supprimer « ${row?.title || 'cet élément'} » et ses enfants ?`)) return
    try {
      await api(`/admin/content/${resource}/${deleteButton.dataset.delete}`, { method: 'DELETE' })
      editingId = null
      await loadData()
    } catch (error) {
      showMessage(message, error.message)
    }
    return
  }
  const userRow = event.target.closest('[data-user]')
  if (userRow) {
    try {
      const detail = await api(`/admin/users/${userRow.dataset.user}/progress`)
      document.querySelector('#user-detail').innerHTML = `<section class="card" style="margin-top:1rem"><h2>${escapeHtml(detail.user.username)}</h2><p class="muted">${escapeHtml(detail.user.email)}</p>${renderTable(detail.sessions, [['seasonTitle', 'Saison'], ['weekTitle', 'Semaine'], ['sessionTitle', 'Séance'], ['status', 'Statut'], ['distanceKm', 'Distance'], ['stepsCount', 'Pas']], false)}</section>`
    } catch (error) {
      showMessage(message, error.message)
    }
  }
})

content.addEventListener('submit', async (event) => {
  if (event.target.id !== 'content-form') return
  event.preventDefault()
  const definition = definitions[resource]
  const formData = new FormData(event.target)
  const body = Object.fromEntries(formData.entries())
  definition.fields.forEach(([key, , type]) => {
    if (type === 'number' || ['season', 'week', 'session'].includes(type)) body[key] = Number(body[key])
  })
  try {
    const suffix = editingId ? `/${editingId}` : ''
    await api(`/admin/content/${resource}${suffix}`, { method: editingId ? 'PUT' : 'POST', body })
    editingId = null
    await loadData()
  } catch (error) {
    showMessage(message, error.message)
  }
})

async function start() {
  const user = await requireUser('admin')
  if (!user) return
  mountNavigation(user)
  await loadData()
}

start()
