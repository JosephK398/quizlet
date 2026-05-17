/**
 * QuizBlast — routes/quiz.js
 * REST endpoints for quiz management (backed by JSON file store).
 */

const express = require('express');
const router  = express.Router();
const { getAllQuizzes, getQuiz, createQuiz, updateQuiz, deleteQuiz } = require('../db');

// GET all quizzes
router.get('/', (req, res) => {
  try { res.json(getAllQuizzes()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single quiz
router.get('/:id', (req, res) => {
  try {
    const quiz = getQuiz(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create quiz
router.post('/', (req, res) => {
  try {
    const { title, description = '', questions = [] } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!questions.length) return res.status(400).json({ error: 'At least one question required' });
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text?.trim()) return res.status(400).json({ error: `Question ${i+1} has no text` });
      if (!Array.isArray(q.options) || q.options.length !== 4)
        return res.status(400).json({ error: `Question ${i+1} needs exactly 4 options` });
      if (q.options.some(o => !o?.trim()))
        return res.status(400).json({ error: `Question ${i+1} has an empty option` });
      if (q.correctAnswer == null || q.correctAnswer < 0 || q.correctAnswer > 3)
        return res.status(400).json({ error: `Question ${i+1} needs correctAnswer 0–3` });
    }
    res.status(201).json(createQuiz(title, description, questions));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update quiz
router.put('/:id', (req, res) => {
  try {
    const { title, description = '', questions = [] } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const quiz = updateQuiz(req.params.id, title, description, questions);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE quiz
router.delete('/:id', (req, res) => {
  try {
    const deleted = deleteQuiz(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Quiz not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
