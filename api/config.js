module.exports = function config(_request, response) {
  const configuredUrl = String(process.env.BACKEND_API_URL || '').trim().replace(/\/$/, '')

  if (!configuredUrl.startsWith('https://')) {
    return response.status(500).json({
      message: 'BACKEND_API_URL doit contenir l’adresse HTTPS du backend dans les variables Vercel.',
    })
  }

  response.setHeader('Cache-Control', 'no-store')
  return response.json({
    apiBase: configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`,
  })
}
