const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-development-only';

// Send OTP
router.post('/otp/send', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  // In production, integrate with Twilio, SNS, or local SMS gateway like InfoBip/SMSGateway.
  // For MVP / local testing, we assume 123456 is sent.
  console.log(`Mock OTP 123456 sent to ${phoneNumber}`);

  res.json({ success: true, message: 'OTP sent successfully.' });
});

// Verify OTP
router.post('/otp/verify', async (req, res) => {
  const { phoneNumber, code } = req.body;

  if (code !== '123456') {
    return res.status(400).json({ error: 'Invalid OTP code.' });
  }

  try {
    // 1. Ensure user exists
    let user = await db.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber]);
    let userId;

    if (user.rows.length === 0) {
      const insertResult = await db.query(
        'INSERT INTO users (phone_number) VALUES ($1) RETURNING id',
        [phoneNumber]
      );
      userId = insertResult.rows[0].id;
    } else {
      userId = user.rows[0].id;
    }

    // 2. Generate session token
    const token = jwt.sign({ id: userId, phone_number: phoneNumber }, JWT_SECRET, {
      expiresIn: '30d'
    });

    res.json({ token, userId });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
