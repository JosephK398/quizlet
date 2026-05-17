# ⚡ QuizBlast

A Kahoot-style real-time multiplayer quiz platform that runs entirely on your internal network — no internet required for gameplay.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   BROWSER (Host)                       │
│  React SPA  ──── REST /api/quiz ───┐                   │
│             ──── WebSocket ────────┤                   │
└────────────────────────────────────│───────────────────┘
                                     │
┌────────────────────────────────────│───────────────────┐
│              Node.js Server (:3001)│                   │
│                                    │                   │
│  Express REST  ←──────────────────┘                   │
│  Socket.IO     ←── players join via PIN               │
│  better-sqlite3 (quizblast.db)                        │
└────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────┴──────────────────────────────┐
│           BROWSER (Players — phone/tablet)             │
│  React SPA  ──── WebSocket (same LAN) ────────────────┤
└────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Vite                   |
| Realtime  | Socket.IO 4 (WebSocket + polling) |
| Backend   | Node.js + Express 4               |
| Database  | SQLite via better-sqlite3         |
| Deploy    | Docker / docker-compose (optional)|

### Scoring Formula

Correct answer points scale with speed:

```
points = 500 + 500 × (1 − timeElapsed / timeLimit)
```

Maximum **1000 pts** for an instant answer; minimum **500 pts** for a last-second correct answer; **0 pts** for wrong or no answer.

---

## Project Structure

```
quizblast/
├── server/
│   ├── index.js            # Express + Socket.IO entry point
│   ├── db.js               # SQLite setup & helpers
│   ├── routes/
│   │   └── quiz.js         # REST CRUD for quizzes
│   ├── socket/
│   │   └── gameHandler.js  # All WebSocket game logic
│   └── data/
│       ├── sampleQuiz.json # Seed data
│       └── quizblast.db    # Created at runtime
│
├── client/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── index.css
│       ├── socket.js
│       ├── context/
│       │   └── GameContext.jsx   # All state + socket listeners
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── FinalScoreboard.jsx
│       │   ├── host/
│       │   │   ├── Dashboard.jsx
│       │   │   ├── QuizCreator.jsx
│       │   │   ├── Lobby.jsx
│       │   │   └── GameScreen.jsx
│       │   └── player/
│       │       ├── JoinGame.jsx
│       │       ├── PlayerLobby.jsx
│       │       ├── QuestionScreen.jsx
│       │       └── ResultScreen.jsx
│       └── components/
│           ├── Timer.jsx
│           ├── Leaderboard.jsx
│           └── AnswerBar.jsx
│
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Quick Start (Development)

### Prerequisites

- **Node.js 18+** — https://nodejs.org
- **npm 9+** (comes with Node)
- A terminal and a browser

### 1 — Install dependencies

```bash
# Backend
cd quizblast/server
npm install

# Frontend
cd ../client
npm install
```

### 2 — Start the backend

```bash
cd quizblast/server
npm run dev        # uses nodemon for auto-reload
# or
npm start          # plain node
```

Server starts on **http://localhost:3001**
A sample quiz is seeded automatically on first run.

### 3 — Start the frontend (dev mode)

```bash
cd quizblast/client
npm run dev
```

Client starts on **http://localhost:5173**
API and WebSocket calls are proxied to `:3001` automatically.

### 4 — Play

| Who   | URL                          | Action                        |
|-------|------------------------------|-------------------------------|
| Host  | http://localhost:5173        | Click **Host a Game**         |
| Player| http://\<your-LAN-IP\>:5173  | Click **Join a Game** + PIN   |

> **Finding your LAN IP:** run `ipconfig` (Windows) or `ifconfig` / `ip addr` (Mac/Linux).  
> Players on the same Wi-Fi use that IP, e.g. `http://192.168.1.42:5173`.

---

## Production Build (single port)

Build the React client and serve everything through the Express server on **one port**:

```bash
# Build client
cd quizblast/client
npm run build

# Run server (serves built client + API + WebSocket)
cd ../server
NODE_ENV=production npm start
```

Access everything at **http://localhost:3001** (or your LAN IP on port 3001).

---

## Docker Deployment

```bash
cd quizblast

# Build and start
docker compose up --build

# Run in background
docker compose up -d --build

# Stop
docker compose down
```

App available at **http://localhost:3001**.  
SQLite data is persisted in a named Docker volume (`quizblast_data`).

### Expose on LAN

By default `0.0.0.0:3001` is bound, so any device on your network can reach it.  
Share `http://<host-machine-LAN-IP>:3001` with players.

---

## REST API Reference

| Method | Path                     | Description              |
|--------|--------------------------|--------------------------|
| GET    | `/api/quiz`              | List all quizzes         |
| GET    | `/api/quiz/:id`          | Get quiz with questions  |
| POST   | `/api/quiz`              | Create quiz              |
| PUT    | `/api/quiz/:id`          | Update quiz              |
| DELETE | `/api/quiz/:id`          | Delete quiz              |
| GET    | `/api/quiz/:id/results`  | Past session results     |
| GET    | `/api/health`            | Health check             |

### Create Quiz payload

```json
{
  "title": "My Quiz",
  "description": "Optional description",
  "questions": [
    {
      "text": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "correctAnswer": 1,
      "timeLimit": 15,
      "image": "https://example.com/optional.png"
    }
  ]
}
```

---

## WebSocket Events

### Host → Server

| Event               | Payload           | Description               |
|---------------------|-------------------|---------------------------|
| `host:create-game`  | `{ quizId }`      | Create game, get PIN      |
| `host:start-game`   | `{ pin }`         | Start the quiz            |
| `host:next-question`| `{ pin }`         | Advance to next question  |
| `host:end-game`     | `{ pin }`         | End game, show scores     |

### Player → Server

| Event           | Payload              | Description         |
|-----------------|----------------------|---------------------|
| `player:join`   | `{ pin, name }`      | Join a game         |
| `player:answer` | `{ answerIndex }`    | Submit answer (0–3) |

### Server → Clients (selected)

| Event                  | Audience     | Payload                                    |
|------------------------|--------------|--------------------------------------------|
| `game:created`         | Host         | `{ pin, quizTitle, questionCount }`        |
| `player:joined`        | Host         | `{ name, count, players[] }`               |
| `game:started`         | All          | —                                          |
| `question:start`       | Players      | `{ index, total, text, options, timeLimit }`|
| `question:start:host`  | Host         | Same + `correctAnswer`                     |
| `question:stats`       | Host         | `{ counts[], answered, total }`            |
| `question:ended`       | All          | `{ correctAnswer, counts, leaderboard, isLast }`|
| `answer:result`        | Player       | `{ correct, points, totalScore, rank }`    |
| `game:ended`           | All          | `{ finalLeaderboard[] }`                   |
| `join:success`         | Player       | `{ name, quizTitle }`                      |
| `join:error`           | Player       | `{ message }`                              |

---

## Game Flow

```
HOST                                    PLAYERS
 │                                         │
 ├─ host:create-game ──────────────────────┤
 │← game:created (PIN)                     │
 │                                         ├─ player:join (PIN + name)
 │← player:joined                          │← join:success
 │                                         │
 ├─ host:start-game                        │
 │──────────── game:started ──────────────►│
 │                                         │
 │──── question:start:host ───────────────►│(host only, + correctAnswer)
 │──── question:start ─────────────────── ►│(players)
 │← question:stats (live)                  ├─ player:answer
 │                                         │← answer:received
 │                                         │
 │(timer expires or all answered)          │
 │──────────── question:ended ────────────►│
 │← answer:result (per player)             │← answer:result
 │                                         │
 ├─ host:next-question                     │
 │  (repeat for each question)             │
 │                                         │
 ├─ host:end-game                          │
 │──────────── game:ended ────────────────►│
 │               (finalLeaderboard)        │
```

---

## Customisation

### Change default time limit

In `server/data/sampleQuiz.json`, set `timeLimit` per question (seconds).

### Change server port

```bash
PORT=8080 npm start
```

Or set `PORT=8080` in a `.env` file (add `require('dotenv').config()` to `server/index.js`).

### Add authentication for hosts

Add a middleware to `server/routes/quiz.js` checking a `x-admin-token` header, and prompt for it in the Dashboard component.

### Import quizzes via CSV

Add a `/api/quiz/import` endpoint that parses a CSV file using the `csv-parse` npm package. Expected columns: `question,optionA,optionB,optionC,optionD,correctLetter,timeLimit`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `better-sqlite3` build fails | Run `npm install --build-from-source` or ensure Python + make are installed |
| Players can't connect | Check firewall allows port 5173/3001; share LAN IP, not `localhost` |
| WebSocket falls back to polling | Normal on some networks; gameplay still works |
| "Game not found" on join | PIN expired or host left; ask host to create a new game |
| Port already in use | `PORT=3002 npm start` / change `vite.config.js` port |

---

## License

MIT — use freely for internal tooling, education, and team events.
