/**
 * QuizBlast Server — index.js
 * Express + Socket.IO backend for real-time quiz gameplay.
 */

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');

const { initDB }       = require('./db');
const quizRoutes       = require('./routes/quiz');
const setupGameHandlers = require('./socket/gameHandler');

const app    = express();
const server = http.createServer(app);

// ─── Socket.IO setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  // Tune for low-latency LAN use
  pingInterval: 10000,
  pingTimeout: 5000,
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ─── REST routes ─────────────────────────────────────────────────────────────
app.use('/api/quiz', quizRoutes);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ─── Serve built client (production) ─────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) =>
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(200).send('QuizBlast API running. Start the dev client separately.');
  })
);

// ─── Global error handler — always returns JSON, never an empty body ─────────
// Must be defined AFTER all routes (4-argument signature required by Express).
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  console.error('Unhandled server error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Initialise DB & WebSocket handlers ──────────────────────────────────────
initDB();
setupGameHandlers(io);

// ─── Start listening ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚡  QuizBlast server running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://0.0.0.0:${PORT}\n`);
});
