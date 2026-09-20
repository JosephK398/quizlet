/**
 * QuizBlast — socket.js
 * Singleton Socket.IO client instance.
 * Connects to same origin (proxied to :3001 in dev, direct in prod).
 */


import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ["websocket", "polling"]
});

export default socket;


