/**
 * QuizBlast Server
 * Express + Socket.IO backend
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { initDB } = require("./db");
const quizRoutes = require("./routes/quiz");
const setupGameHandlers = require("./socket/gameHandler");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.use(express.json({ limit: "10mb" }));

// ─── Health check ────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

// ─── REST API routes ─────────────────────────────────────────────────────────
// Your frontend must call /api/quiz, not /api/quizzes.

app.use("/api/quiz", quizRoutes);

// ─── Error handling ──────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON in request body."
    });
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal server error"
  });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

// ─── Start application ───────────────────────────────────────────────────────

try {
  initDB();
  setupGameHandlers(io);

  server.listen(PORT, "0.0.0.0", () => {
    console.log("QuizBlast server running");
    console.log(`Port: ${PORT}`);
    console.log(`Client origin: ${CLIENT_ORIGIN}`);
  });
} catch (error) {
  console.error("Failed to start QuizBlast server:", error);
  process.exit(1);
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
