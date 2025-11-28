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

// Manejar conexiones de clientes (apps Android)
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

// Ruta de información del servidor
app.get('/', (req, res) => {
  res.json({
    name: 'Parking Stream Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      frame_upload: '/frame (POST)',
      websocket: 'socket.io'
    },
    stats: {
      connected_clients: clientCount,
      total_frames_received: frameCount,
      has_current_frame: currentFrame !== null
    },
    usage: {
      python_upload: 'POST /frame con { "frame": "base64_string" }',
      client_connect: 'Conectar via Socket.IO y escuchar "video-frame"'
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor de streaming ejecutándose en puerto ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 WebSocket ready para conexiones`);
  console.log(`📤 Endpoint para Python: http://localhost:${PORT}/frame`);
});