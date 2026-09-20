/**
 * QuizBlast — db.js  (v2 — JSON file storage, zero native dependencies)
 *
 * Replaces better-sqlite3 with plain fs read/write.
 * Works on ANY Node.js version, no C++ compilation required.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'quizzes.json');

// In-memory store (synced to disk)
let store = { quizzes: [], nextId: 1 };

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk() {
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      store = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
      console.warn('⚠  Could not parse quizzes.json — starting fresh:', err.message);
      store = { quizzes: [], nextId: 1 };
    }
  }
}

function saveToDisk() {
  ensureDir();
  try {
    // Write to a temp file first, then rename — prevents data corruption on crash
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('saveToDisk failed:', err.message);
    throw new Error('Could not save quiz data: ' + err.message);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

function initDB() {
  loadFromDisk();
  if (store.quizzes.length === 0) {
    const sample = require('./data/sampleQuiz.json');
    store.quizzes.push({
      id: store.nextId++,
      title: sample.title,
      description: sample.description,
      questions: sample.questions,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!process.env.VERCEL) {
      saveToDisk();
    }
    console.log('✅  Sample quiz seeded');
  }
  console.log(`✅  Data store ready: ${DB_FILE} (${store.quizzes.length} quiz/quizzes)`);
}

function getAllQuizzes() {
  return store.quizzes.map(q => ({
    id: q.id, title: q.title, description: q.description,
    question_count: (q.questions || []).length,
    created_at: q.created_at, updated_at: q.updated_at,
  }));
}

function getQuiz(id) {
  return store.quizzes.find(q => q.id === Number(id)) || null;
}

function createQuiz(title, description, questions) {
  const now  = new Date().toISOString();
  const quiz = { id: store.nextId++, title: title.trim(), description: (description||'').trim(), questions, created_at: now, updated_at: now };
  store.quizzes.push(quiz);
  saveToDisk();
  return quiz;
}

function updateQuiz(id, title, description, questions) {
  const idx = store.quizzes.findIndex(q => q.id === Number(id));
  if (idx === -1) return null;
  store.quizzes[idx] = { ...store.quizzes[idx], title: title.trim(), description: (description||'').trim(), questions, updated_at: new Date().toISOString() };
  saveToDisk();
  return store.quizzes[idx];
}

function deleteQuiz(id) {
  const idx = store.quizzes.findIndex(q => q.id === Number(id));
  if (idx === -1) return false;
  store.quizzes.splice(idx, 1);
  saveToDisk();
  return true;
}

function saveSession(pin, quizId, players) {
  const names = [...players.values()].map(p => `${p.name}(${p.score})`).join(', ');
  console.log(`📋  Session ${pin} complete → ${names || 'no players'}`);
}

module.exports = { initDB, getAllQuizzes, getQuiz, createQuiz, updateQuiz, deleteQuiz, saveSession };
