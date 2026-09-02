import { register } from './api.js'
import { redirectAuthenticatedUser, setLoading, showMessage } from './common.js'

if (!redirectAuthenticatedUser()) {
  const form = document.querySelector('#register-form')
  const message = document.querySelector('#message')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('button[type="submit"]')
    showMessage(message, '')
    setLoading(button, true, 'Création…')
    try {
      await register(
        document.querySelector('#username').value.trim(),
        document.querySelector('#email').value.trim(),
        document.querySelector('#password').value,
      )
      window.location.replace('/index.html')
    } catch (error) {
      showMessage(message, error.message)
      setLoading(button, false)
    }
  })
}
