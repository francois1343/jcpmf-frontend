// Texte et image utilisés par la fenêtre de partage de fin de séance.
function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

export function formatShareDuration(totalSeconds) {
  const minutes = Math.max(0, Math.round(safeNumber(totalSeconds) / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours} h ${String(remainingMinutes).padStart(2, '0')}` : `${hours} h`
}

export function formatShareDate(value) {
  if (!value) return 'Aucune séance'
  const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return 'Aucune séance'
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' }).format(date)
}

function normalizeSummary(summary = {}) {
  const stats = summary.stats || {}
  return {
    title: String(summary.title || 'Ma séance JCPMF'),
    completedAt: summary.completedAt || new Date().toISOString(),
    durationSeconds: safeNumber(summary.durationSeconds),
    distanceKm: safeNumber(summary.distanceKm),
    stats: {
      totalSessions: Math.round(safeNumber(stats.totalSessions)),
      totalDurationSeconds: safeNumber(stats.totalDurationSeconds),
      dailyStreak: Math.round(safeNumber(stats.dailyStreak)),
      weeklyStreak: Math.round(safeNumber(stats.weeklyStreak)),
      bestDay: {
        date: stats.bestDay?.date || null,
        durationSeconds: safeNumber(stats.bestDay?.durationSeconds),
      },
    },
  }
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value > 1 ? pluralForm : singular}`
}

function distanceLabel(distanceKm) {
  return distanceKm > 0
    ? `${distanceKm.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
    : 'Sans GPS'
}

export function buildShareText(summary) {
  const data = normalizeSummary(summary)
  const bestDay = data.stats.bestDay.date
    ? `${formatShareDuration(data.stats.bestDay.durationSeconds)} · ${formatShareDate(data.stats.bestDay.date)}`
    : 'À venir'
  return [
    '🏃 Ma séance JCPMF est terminée !',
    data.title,
    `⏱ ${formatShareDuration(data.durationSeconds)} · 📍 ${distanceLabel(data.distanceKm)}`,
    `🔥 Série : ${plural(data.stats.dailyStreak, 'jour')} · ${plural(data.stats.weeklyStreak, 'semaine')}`,
    `👟 Temps course/marche : ${formatShareDuration(data.stats.totalDurationSeconds)}`,
    `🏅 Meilleure journée : ${bestDay}`,
    '#JCPMF #Running #CourseAPied',
  ].join('\n')
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maximumLines = 2) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  const visibleLines = lines.slice(0, maximumLines)
  if (lines.length > maximumLines) {
    let finalLine = visibleLines[maximumLines - 1]
    while (context.measureText(`${finalLine}…`).width > maxWidth && finalLine.includes(' ')) {
      finalLine = finalLine.slice(0, finalLine.lastIndexOf(' '))
    }
    visibleLines[maximumLines - 1] = `${finalLine}…`
  }
  visibleLines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight))
  return y + visibleLines.length * lineHeight
}

function drawMetric(context, { x, y, width, label, value }) {
  roundedRect(context, x, y, width, 174, 30)
  context.fillStyle = 'rgba(255,255,255,.1)'
  context.fill()
  context.fillStyle = '#a9e8c0'
  context.font = '700 28px system-ui, sans-serif'
  context.fillText(label.toUpperCase(), x + 34, y + 48)
  context.fillStyle = '#ffffff'
  context.font = '800 52px system-ui, sans-serif'
  context.fillText(value, x + 34, y + 119)
}

function drawStat(context, { y, label, value, detail }) {
  roundedRect(context, 80, y, 920, 140, 28)
  context.fillStyle = '#ffffff'
  context.fill()
  context.fillStyle = '#1d7a48'
  context.font = '800 25px system-ui, sans-serif'
  context.fillText(label.toUpperCase(), 116, y + 45)
  context.fillStyle = '#102f21'
  context.font = '800 42px system-ui, sans-serif'
  context.fillText(value, 116, y + 98)
  if (detail) {
    context.fillStyle = '#66786c'
    context.font = '600 25px system-ui, sans-serif'
    context.textAlign = 'right'
    context.fillText(detail, 962, y + 88)
    context.textAlign = 'left'
  }
}

export function createShareCardBlob(summary) {
  const data = normalizeSummary(summary)
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Création du visuel indisponible.'))

  const gradient = context.createLinearGradient(0, 0, 1080, 1350)
  gradient.addColorStop(0, '#102f21')
  gradient.addColorStop(.58, '#17683e')
  gradient.addColorStop(1, '#1d7a48')
  context.fillStyle = gradient
  context.fillRect(0, 0, 1080, 1350)

  context.fillStyle = 'rgba(112,217,154,.12)'
  context.beginPath()
  context.arc(980, 80, 285, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.arc(65, 1330, 235, 0, Math.PI * 2)
  context.fill()

  roundedRect(context, 80, 70, 535, 58, 29)
  context.fillStyle = '#dcf4e5'
  context.fill()
  context.fillStyle = '#17683e'
  context.font = '800 25px system-ui, sans-serif'
  context.fillText('JCPMF  ·  JE COURS POUR MA FORME', 108, 108)

  context.fillStyle = '#8ce8ae'
  context.font = '800 27px system-ui, sans-serif'
  context.fillText('SÉANCE TERMINÉE', 80, 202)
  context.fillStyle = '#ffffff'
  context.font = '800 66px system-ui, sans-serif'
  drawWrappedText(context, data.title, 80, 275, 900, 75, 2)

  drawMetric(context, {
    x: 80, y: 420, width: 442, label: 'Temps actif', value: formatShareDuration(data.durationSeconds),
  })
  drawMetric(context, {
    x: 558, y: 420, width: 442, label: 'Distance', value: distanceLabel(data.distanceKm),
  })

  context.fillStyle = '#a9e8c0'
  context.font = '800 27px system-ui, sans-serif'
  context.fillText('MA RÉGULARITÉ', 80, 672)

  drawStat(context, {
    y: 710,
    label: 'Série actuelle',
    value: plural(data.stats.dailyStreak, 'jour'),
    detail: plural(data.stats.weeklyStreak, 'semaine'),
  })
  drawStat(context, {
    y: 875,
    label: 'Temps course / marche',
    value: formatShareDuration(data.stats.totalDurationSeconds),
    detail: plural(data.stats.totalSessions, 'séance'),
  })
  drawStat(context, {
    y: 1040,
    label: 'Meilleure journée',
    value: data.stats.bestDay.date ? formatShareDuration(data.stats.bestDay.durationSeconds) : 'À venir',
    detail: data.stats.bestDay.date ? formatShareDate(data.stats.bestDay.date) : '',
  })

  context.fillStyle = 'rgba(255,255,255,.78)'
  context.font = '600 25px system-ui, sans-serif'
  context.fillText(formatShareDate(data.completedAt), 80, 1280)
  context.textAlign = 'right'
  context.fillText('#JCPMF  #Running  #CourseAPied', 1000, 1280)
  context.textAlign = 'left'

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Création du visuel indisponible.'))
    }, 'image/png', .94)
  })
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('La copie du bilan a échoué.')
}

export function prepareShareSummary(summary) {
  const data = normalizeSummary(summary)
  const text = buildShareText(data)
  const filePromise = createShareCardBlob(data)
    .then((blob) => typeof File === 'function' ? new File([blob], 'bilan-jcpmf.png', { type: 'image/png' }) : null)
    .catch(() => null)
  return { data, text, filePromise }
}

export async function sharePreparedSummary(prepared) {
  const file = await prepared.filePromise
  if (navigator.share) {
    const shareData = { title: 'Mon bilan JCPMF', text: prepared.text }
    if (file && navigator.canShare?.({ files: [file] })) shareData.files = [file]
    try {
      await navigator.share(shareData)
      return { method: shareData.files ? 'image' : 'text', message: 'Bilan partagé.' }
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'cancelled', message: '' }
    }
  }
  await copyText(prepared.text)
  return { method: 'copy', message: 'Bilan copié. Vous pouvez le coller dans votre publication.' }
}
