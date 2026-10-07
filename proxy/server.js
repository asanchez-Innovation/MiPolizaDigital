const express = require('express')
const cors = require('cors')
const { createProxyMiddleware } = require('http-proxy-middleware')

const app = express()

// 1. Permitir que tu JS del frontend llame al proxy sin bloqueos
app.use(cors())

// Middleware para imprimir en consola cada petición que entra al proxy
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] Petición recibida: ${req.method} ${req.url}`
  )
  next()
})

// 2. Configurar la redirección hacia tu backend de .NET Framework
const NET_BACKEND_URL = 'http://localhost:80/WeeClaims/API/api'
const KEY_WEE =
  '286A8D0191DC975F2E0433CAEE96DFC23692F9B638D8C93FF02982A27D4D74A2'
app.use(
  '/api',
  createProxyMiddleware({
    target: NET_BACKEND_URL,
    changeOrigin: true,
    secure: false, // Si usas https con certificados locales de desarrollo
    pathRewrite: {
      '^/api': '' // Remueve '/api' del inicio si tu backend .NET no espera ese prefijo
    },
    on: {
      // Intercepta la petición ANTES de enviarla a .NET para agregar o modificar Headers
      proxyReq: (proxyReq, req, res) => {

        const contentType = req.headers['content-type']
        if (!contentType || !contentType.includes('multipart/form-data')) {
          // Para peticiones JSON normales
          if (req.method !== 'GET') {
            proxyReq.setHeader('Content-Type', 'application/json')
          }
        }
        // Ejemplos de headers que puedes enviar al backend .NET:
        proxyReq.setHeader('X-Proxy-By', 'NodeJS-Proxy')
        proxyReq.setHeader('KeyWee', KEY_WEE)

        console.log(
          `---> Reenviando a: ${NET_BACKEND_URL}${req.url.replace(
            /^\/api/,
            ''
          )}`
        )
      },
      // Intercepta la respuesta QUE VIENE de .NET antes de entregarla al Frontend
      proxyRes: (proxyRes, req, res) => {
        console.log(
          `<--- Respuesta de .NET recibida con Status: ${proxyRes.statusCode}`
        )

        // Si necesitas agregar o forzar algún header específico en la respuesta hacia el frontend:
        proxyRes.headers['X-Procesado-Por'] = 'Mi-Proxy-Local'
      },
      // Captura errores de conexión con el backend
      error: (err, req, res) => {
        console.error('❌ Error en el Proxy:', err.message)
        res.status(500).send('Error de comunicación con el backend .NET')
      }
    }
  })
)

// 3. Levantar el proxy en un puerto diferente
const PORT = 3001
app.listen(PORT, () => {
  console.log(`Proxy corriendo en http://localhost:${PORT}`)
  console.log(`Redirigiendo peticiones a ${NET_BACKEND_URL}`)
})
