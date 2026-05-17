/**
 * QuizBlast — socket/gameHandler.js
 *
 * All real-time game logic lives here.
 *
 * In-memory game state (Map: pin → GameState):
 *   {
 *     pin, quizId, quiz,
 *     hostSocketId,
 *     players:   Map<socketId, PlayerState>,
 *     status:    'lobby' | 'question' | 'leaderboard' | 'ended',
 *     currentQuestion: number (-1 = not started),
 *     questionTimer:   NodeJS.Timeout | null,
 *     questionStartTime: number (ms epoch),
 *     questionAnswerCounts: [n,n,n,n],
 *   }
 *
 * Socket events:
 *   HOST  → server : host:create-game, host:start-game, host:next-question, host:end-game
 *   PLAYER→ server : player:join, player:answer
 *   server→ HOST   : game:created, player:joined, player:left,
 *                    question:start:host, question:stats, question:ended
 *   server→ ALL    : game:started, question:start, question:ended, game:ended
 *   server→ PLAYER : join:success, join:error, answer:received, answer:result, game:error
 */

const { getQuiz, saveSession } = require('../db');

// ─── Live game state ──────────────────────────────────────────────────────────
const games = new Map(); // pin → GameState

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePIN() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

function uniquePIN() {
  let pin;
  do { pin = generatePIN(); } while (games.has(pin));
  return pin;
}

/**
 * Build a sorted leaderboard from current game players.
 * Returns top-10 entries: [{ rank, name, score }]
 */
function buildLeaderboard(game) {
  return [...game.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }));
}

/** Calculate points for a correct answer based on speed. */
function calcPoints(timeElapsed, timeLimit) {
  // 1000 base for instant answer, 500 minimum for just-in-time correct answer
  const speedFactor = Math.max(0, 1 - timeElapsed / timeLimit);
  return Math.round(500 + 500 * speedFactor);
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────

function startQuestion(io, pin) {
  const game = games.get(pin);
  if (!game) return;

  game.currentQuestion += 1;

  if (game.currentQuestion >= game.quiz.questions.length) {
    endGame(io, pin);
    return;
  }

  const q = game.quiz.questions[game.currentQuestion];
  game.status             = 'question';
  game.questionStartTime  = Date.now();
  game.questionAnswerCounts = [0, 0, 0, 0];

  // Reset per-question player state
  for (const player of game.players.values()) {
    player.currentAnswer = null;
  }

  const base = {
    index:     game.currentQuestion,
    total:     game.quiz.questions.length,
    text:      q.text,
    options:   q.options,
    timeLimit: q.timeLimit || 20,
    image:     q.image || null,
  };

  // Players get question WITHOUT correctAnswer
  io.to(`game:${pin}`).emit('question:start', base);

  // Host gets question WITH correctAnswer (for display)
  io.to(`host:${pin}`).emit('question:start:host', { ...base, correctAnswer: q.correctAnswer });

  // Auto-end when timer expires
  game.questionTimer = setTimeout(
    () => endQuestion(io, pin),
    (q.timeLimit || 20) * 1000
  );

  console.log(`[${pin}] Q${game.currentQuestion + 1}: "${q.text}"`);
}

function endQuestion(io, pin) {
  const game = games.get(pin);
  if (!game || game.status !== 'question') return;

  clearTimeout(game.questionTimer);
  game.status = 'leaderboard';

  const q          = game.quiz.questions[game.currentQuestion];
  const leaderboard = buildLeaderboard(game);
  const isLast      = game.currentQuestion >= game.quiz.questions.length - 1;

  const payload = {
    correctAnswer: q.correctAnswer,
    counts:        game.questionAnswerCounts,
    leaderboard,
    isLast,
  };

  // Broadcast question over to everyone
  io.to(`game:${pin}`).emit('question:ended', payload);

  // Send individual answer results to each player
  for (const [socketId, player] of game.players) {
    const lastAnswer = player.answers[player.answers.length - 1];
    const rank = leaderboard.findIndex(p => p.name === player.name) + 1;

    io.to(socketId).emit('answer:result', {
      answered:      !!lastAnswer,
      correct:       lastAnswer ? lastAnswer.correct  : false,
      points:        lastAnswer ? lastAnswer.points   : 0,
      correctAnswer: q.correctAnswer,
      totalScore:    player.score,
      rank:          rank || leaderboard.length + 1,
    });
  }

  console.log(`[${pin}] Question ended. Leaderboard top: ${leaderboard[0]?.name ?? 'nobody'}`);
}

function endGame(io, pin) {
  const game = games.get(pin);
  if (!game) return;

  if (game.questionTimer) clearTimeout(game.questionTimer);
  game.status = 'ended';

  const finalLeaderboard = buildLeaderboard(game);
  io.to(`game:${pin}`).emit('game:ended', { finalLeaderboard });

  // Persist to DB
  saveSession(pin, game.quizId, game.players);

  console.log(`[${pin}] Game ended. Winner: ${finalLeaderboard[0]?.name ?? 'nobody'}`);

  // Clean up after a grace period so late-arriving sockets can still read state
  setTimeout(() => {
    games.delete(pin);
    console.log(`[${pin}] Game cleaned up`);
  }, 60_000);
}

// ─── Main setup ───────────────────────────────────────────────────────────────

function setupGameHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`  Socket connected: ${socket.id}`);

    // ── HOST: Create new game ──────────────────────────────────────────────
    socket.on('host:create-game', ({ quizId }) => {
      const quiz = getQuiz(quizId);
      if (!quiz) { socket.emit('error', { message: 'Quiz not found' }); return; }
      const pin  = uniquePIN();

      const game = {
        pin,
        quizId,
        quiz,
        hostSocketId:         socket.id,
        players:              new Map(),
        status:               'lobby',
        currentQuestion:      -1,
        questionTimer:        null,
        questionStartTime:    0,
        questionAnswerCounts: [0, 0, 0, 0],
      };

      games.set(pin, game);
      socket.data.pin    = pin;
      socket.data.isHost = true;
      socket.join(`game:${pin}`);
      socket.join(`host:${pin}`);

      socket.emit('game:created', {
        pin,
        quizTitle:     quiz.title,
        questionCount: quiz.questions.length,
      });

      console.log(`[${pin}] Game created for quiz "${quiz.title}"`);
    });

    // ── HOST: Start game ───────────────────────────────────────────────────
    socket.on('host:start-game', ({ pin }) => {
      const game = games.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;

      if (game.players.size === 0) {
        socket.emit('error', { message: 'Need at least one player to start!' });
        return;
      }
      if (game.status !== 'lobby') return;

      game.status = 'playing';
      io.to(`game:${pin}`).emit('game:started');

      // Short countdown before first question
      setTimeout(() => startQuestion(io, pin), 3000);
      console.log(`[${pin}] Game started with ${game.players.size} player(s)`);
    });

    // ── HOST: Advance to next question ─────────────────────────────────────
    socket.on('host:next-question', ({ pin }) => {
      const game = games.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;
      if (game.status !== 'leaderboard') return;

      setTimeout(() => startQuestion(io, pin), 1500);
    });

    // ── HOST: End game early ───────────────────────────────────────────────
    socket.on('host:end-game', ({ pin }) => {
      const game = games.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;
      endGame(io, pin);
    });

    // ── PLAYER: Join game ──────────────────────────────────────────────────
    socket.on('player:join', ({ pin, name }) => {
      const game = games.get(pin);

      if (!game) {
        socket.emit('join:error', { message: "Game not found. Check your PIN." });
        return;
      }
      if (game.status !== 'lobby') {
        socket.emit('join:error', { message: "This game has already started." });
        return;
      }

      const trimName = (name || '').trim();
      if (!trimName || trimName.length > 20) {
        socket.emit('join:error', { message: "Name must be 1–20 characters." });
        return;
      }

      // Duplicate name check (case-insensitive)
      const nameTaken = [...game.players.values()]
        .some(p => p.name.toLowerCase() === trimName.toLowerCase());
      if (nameTaken) {
        socket.emit('join:error', { message: "That name is already taken. Try another!" });
        return;
      }

      const player = {
        id:            socket.id,
        name:          trimName,
        score:         0,
        answers:       [],
        currentAnswer: null,
      };

      game.players.set(socket.id, player);
      socket.data.pin      = pin;
      socket.data.isPlayer = true;
      socket.join(`game:${pin}`);

      socket.emit('join:success', {
        name:      trimName,
        quizTitle: game.quiz.title,
      });

      const playerList = [...game.players.values()].map(p => ({ name: p.name, score: p.score }));
      io.to(`host:${pin}`).emit('player:joined', {
        name: trimName,
        count: game.players.size,
        players: playerList,
      });

      console.log(`[${pin}] "${trimName}" joined (${game.players.size} total)`);
    });

    // ── PLAYER: Submit answer ──────────────────────────────────────────────
    socket.on('player:answer', ({ answerIndex }) => {
      const pin = socket.data.pin;
      if (!pin) return;

      const game   = games.get(pin);
      if (!game || game.status !== 'question') return;

      const player = game.players.get(socket.id);
      if (!player || player.currentAnswer !== null) return; // already answered

      const q           = game.quiz.questions[game.currentQuestion];
      const timeElapsed = (Date.now() - game.questionStartTime) / 1000;
      const isCorrect   = answerIndex === q.correctAnswer;
      const points      = isCorrect ? calcPoints(timeElapsed, q.timeLimit || 20) : 0;

      player.currentAnswer = answerIndex;
      player.score        += points;
      player.answers.push({
        questionIndex: game.currentQuestion,
        answerIndex,
        correct: isCorrect,
        points,
        timeElapsed: Math.round(timeElapsed * 10) / 10,
      });

      // Update aggregate counts
      game.questionAnswerCounts[answerIndex] = (game.questionAnswerCounts[answerIndex] || 0) + 1;

      // Acknowledge to the answering player
      socket.emit('answer:received', { answerIndex });

      // Push live stats to host
      const answered = [...game.players.values()].filter(p => p.currentAnswer !== null).length;
      io.to(`host:${pin}`).emit('question:stats', {
        counts:   game.questionAnswerCounts,
        answered,
        total:    game.players.size,
      });

      // If ALL players answered, end question early
      if (answered === game.players.size) {
        clearTimeout(game.questionTimer);
        setTimeout(() => endQuestion(io, pin), 800); // tiny delay for UX
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const pin = socket.data.pin;
      if (!pin) return;

      const game = games.get(pin);
      if (!game) return;

      if (socket.id === game.hostSocketId) {
        // Host left — terminate game for everyone
        io.to(`game:${pin}`).emit('game:error', {
          message: 'The host disconnected. Game over.',
        });
        if (game.questionTimer) clearTimeout(game.questionTimer);
        games.delete(pin);
        console.log(`[${pin}] Host disconnected — game deleted`);
      } else if (game.players.has(socket.id)) {
        const player = game.players.get(socket.id);
        game.players.delete(socket.id);

        const playerList = [...game.players.values()].map(p => ({ name: p.name, score: p.score }));
        io.to(`host:${pin}`).emit('player:left', {
          name:    player.name,
          count:   game.players.size,
          players: playerList,
        });
        console.log(`[${pin}] "${player.name}" disconnected`);
      }
    });
  });
}

module.exports = setupGameHandlers;
