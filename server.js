const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configurar Socket.IO con CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Almacenamiento del último frame
let currentFrame = null;
let clientCount = 0;
let frameCount = 0;

// Health check endpoint (requerido para Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    clients: clientCount,
    total_frames: frameCount,
    message: 'Servidor de streaming funcionando'
  });
});

// Endpoint para recibir frames desde Python
app.post('/frame', (req, res) => {
  try {
    const { frame } = req.body;
    
    if (!frame) {
      return res.status(400).json({ error: 'No se recibió frame data' });
    }

    // Actualizar el frame actual
    currentFrame = frame;
    frameCount++;
    
    // Enviar a todos los clientes conectados
    io.emit('video-frame', frame);
    
    if (frameCount % 30 === 0) { // Log cada 30 frames
      console.log(`📊 Frame ${frameCount} enviado a ${clientCount} clientes`);
    }
    
    res.json({ 
      success: true, 
      message: 'Frame recibido y transmitido',
      clients: clientCount,
      frame_number: frameCount
    });
    
  } catch (error) {
    console.error('❌ Error procesando frame:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Manejar conexiones de clientes (apps Android / navegadores)
io.on('connection', (socket) => {
  clientCount++;
  console.log(`📱 Cliente conectado: ${socket.id} (Total: ${clientCount})`);
  
  // Enviar frame actual inmediatamente al nuevo cliente
  if (currentFrame) {
    socket.emit('video-frame', currentFrame);
    console.log(`🎯 Frame enviado a nuevo cliente: ${socket.id}`);
  }
  
  socket.on('disconnect', () => {
    clientCount--;
    console.log(`❌ Cliente desconectado: ${socket.id} (Total: ${clientCount})`);
  });
  
  socket.on('error', (error) => {
    console.error(`💥 Error en cliente ${socket.id}:`, error);
  });
});

// Ruta raíz con info
app.get('/', (req, res) => {
  res.json({
    name: 'Parking Stream Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      frame_upload: '/frame (POST)',
      viewer: '/viewer',
      websocket: 'socket.io'
    },
    stats: {
      connected_clients: clientCount,
      total_frames_received: frameCount,
      has_current_frame: currentFrame !== null
    }
  });
});

// 🔥 VIEWER HTML para ver el video desde cualquier navegador / WebView
app.get('/viewer', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8" />
        <title>Streaming Parking</title>
        <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    </head>
    <body style="background:#111; color:#fff; text-align:center; margin:0; padding:0;">
        <h2 style="font-family:sans-serif;">📡 Streaming desde Render</h2>
        <img id="video" style="width:90%; max-width:600px; border:2px solid #fff;">

        <script>
            // Se conecta al mismo dominio de donde se sirve la página
            const socket = io();

            socket.on("connect", () => {
                console.log("🔌 Conectado a servidor de streaming");
            });

            socket.on("video-frame", (frameBase64) => {
                const img = document.getElementById("video");
                img.src = "data:image/jpeg;base64," + frameBase64;
            });

            socket.on("disconnect", () => {
                console.log("❌ Desconectado del servidor");
            });
        </script>
    </body>
    </html>
  `);
});

// Inicio del servidor (Render define el puerto en process.env.PORT)
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(\`🚀 Servidor de streaming ejecutándose en puerto \${PORT}\`);
  console.log(\`🌐 Health check: http://localhost:\${PORT}/health\`);
  console.log(\`📡 WebSocket listo para conexiones\`);
  console.log(\`📤 Punto final para Python : http://localhost:\${PORT}/frame\`);
  console.log(\`🖥️ Viewer disponible en /viewer\`);
});
