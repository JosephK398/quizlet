/**
 * QuizBlast — socket.js
 * Singleton Socket.IO client instance.
 * Connects to same origin (proxied to :3001 in dev, direct in prod).
 */
import { io } from 'socket.io-client';

const socket = io('/', {
  autoConnect: false,        // we connect manually inside GameContext
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling'],
});

export default socket;
