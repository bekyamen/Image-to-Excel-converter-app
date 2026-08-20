const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const db = require('../db');
const authenticateToken = require('../middleware/auth');
const { runOCR } = require('../services/ocr');
const { generateExcelBuffer } = require('../services/excelExport');

const router = express.Router();

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/convert', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded.' });
  }

  const imagePath = req.file.path;
  const userId = req.user.id;

  try {
    // 1. Check Limits
    const userResult = await db.query('SELECT plan, free_conversions_used FROM users WHERE id = $1', [userId]);
    const { plan, free_conversions_used } = userResult.rows[0];

    if (plan === 'free' && free_conversions_used >= 100) {
      return res.status(402).json({ error: 'No free conversions left. Please pay to continue.' });
    }

    // 2. Run OCR
    const table = await runOCR(imagePath);
    
    // 3. Save Conversion Record
    const result = await db.query(
      'INSERT INTO conversions (user_id, original_filename, status, row_count, column_count) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, req.file.originalname, 'success', table.rows.length, table.headers.length]
    );

    const conversionId = result.rows[0].id;
    
    // 4. Update usage stats
    if (plan === 'free') {
      await db.query('UPDATE users SET free_conversions_used = free_conversions_used + 1 WHERE id = $1', [userId]);
    }

    res.json({ conversionId, table });
  } catch (err) {
    console.error('OCR error:', err);
    
    // Attempt inserting failed record
    try {
      await db.query(
        'INSERT INTO conversions (user_id, original_filename, status) VALUES ($1, $2, $3)',
        [userId, req.file.originalname, 'failed']
      );
    } catch (dbErr) {
      console.error('DB Insert error:', dbErr);
    }

    res.status(500).json({ error: 'Conversion failed. Please try a clearer image.' });
  } finally {
    // Delete the uploaded image after processing
    fs.unlink(imagePath, () => {});
  }
});

router.post('/convert/:id/export', express.json(), (req, res) => {
  const edited = req.body && req.body.table ? req.body.table : null;

  if (!edited) {
    return res.status(400).json({ error: 'Table data is required for export.' });
  }

  try {
    const buffer = generateExcelBuffer(edited);
    res.setHeader('Content-Disposition', 'attachment; filename="extracted.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Could not generate Excel file.' });
  }
});

module.exports = router;
