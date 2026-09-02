const http = require('http')
const fs = require('fs')
const path = require('path')

const root = __dirname
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
}

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname)
  const requested = pathname === '/' ? '/index.html' : pathname
  const filePath = path.resolve(root, `.${requested}`)

  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Accès refusé')
    return
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Page introuvable')
      return
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(filePath).pipe(response)
  })
}).listen(port, host, () => {
  console.log(`Frontend JCPMF : http://127.0.0.1:${port}`)
})
