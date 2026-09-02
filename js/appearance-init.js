(() => {
  let theme = 'auto'
  try {
    const stored = localStorage.getItem('app_theme')
    if (['light', 'dark', 'auto'].includes(stored)) theme = stored
  } catch {
    // Le thème automatique reste utilisable si le stockage est indisponible.
  }
  document.documentElement.dataset.theme = theme
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = dark ? '#101d16' : '#17683e'
})()
