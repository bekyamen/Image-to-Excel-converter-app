const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');


const router = express.Router();

// Get Usage Context
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const userResult = await db.query('SELECT plan, free_conversions_used FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { plan, free_conversions_used } = userResult.rows[0];
    const max_free = 3;
    const remaining = plan === 'free' ? Math.max(0, max_free - free_conversions_used) : 999; 

    res.json({
      plan,
      free_conversions_used,
      remaining,
      hasAccess: remaining > 0 || plan !== 'free'
    });
  } catch (err) {
    console.error('Usage error:', err);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// Get Conversion History
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const historyResult = await db.query(
      'SELECT id, original_filename, status, row_count, column_count, created_at FROM conversions WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json({ history: historyResult.rows });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;

