import { login, startDemoSession } from './api.js'
import { redirectAuthenticatedUser, setLoading, showMessage } from './common.js'

const form = document.querySelector('#login-form')
const message = document.querySelector('#message')

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = form.querySelector('button[type="submit"]')
  showMessage(message, '')
  setLoading(button, true, 'Connexion…')
  try {
    const user = await login(
      document.querySelector('#identifier').value.trim(),
      document.querySelector('#password').value,
    )
    window.location.replace(user.role === 'admin' ? '/admin.html' : '/index.html')
  } catch (error) {
    showMessage(message, error.message)
    setLoading(button, false)
  }
})

document.querySelector('#start-demo').addEventListener('click', () => {
  startDemoSession()
  window.location.replace('/index.html')
})

redirectAuthenticatedUser()
