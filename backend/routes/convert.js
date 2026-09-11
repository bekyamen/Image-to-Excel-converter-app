const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const db = require('../db');
const authenticateToken = require('../middleware/auth');
const { runOCR } = require('../services/ocr');
const { generateExcelBuffer, generateCSVBuffer, generatePDFBuffer } = require('../services/excelExport');

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

    let finalImagePath = imagePath;
    if (req.body.enhance === 'true') {
      const enhancedPath = path.join(__dirname, '..', 'uploads', `enh_${req.file.filename}`);
      await sharp(imagePath).normalize().threshold(180).trim().toFile(enhancedPath);
      finalImagePath = enhancedPath;
    }

    // 2. Run OCR
    const table = await runOCR(finalImagePath);
    
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

    res.json({ conversionId, table, filename: req.file.filename });
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

    let errorMessage = 'Conversion failed. Please try a clearer image.';
    if (err.message && (err.message.includes('429') || err.message.includes('quota'))) {
      errorMessage = 'OCR API Quota Exceeded. Please try again in a few moments.';
    }

    res.status(500).json({ error: errorMessage });
  }
});

router.post('/convert/:id/export', express.json(), async (req, res) => {
  const edited = req.body && req.body.table ? req.body.table : null;
  const format = req.body && req.body.format ? req.body.format : 'xlsx';

  if (!edited) {
    return res.status(400).json({ error: 'Table data is required for export.' });
  }

  try {
    if (format === 'csv') {
      const buffer = generateCSVBuffer(edited);
      res.setHeader('Content-Disposition', 'attachment; filename="extracted.csv"');
      res.setHeader('Content-Type', 'text/csv');
      res.send(buffer);
    } else if (format === 'pdf') {
      const buffer = await generatePDFBuffer(edited);
      res.setHeader('Content-Disposition', 'attachment; filename="extracted.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      res.send(buffer);
    } else {
      const buffer = generateExcelBuffer(edited);
      res.setHeader('Content-Disposition', 'attachment; filename="extracted.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    }
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Could not generate export file.' });
  }
});

router.post('/preprocess', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded for preprocessing.' });
  }

  const inputPath = req.file.path;
  const outputFilename = `processed_${req.file.filename}`;
  const outputPath = path.join(__dirname, '..', 'uploads', outputFilename);

  try {
    await sharp(inputPath)
      .normalize() // contrast enhancement
      .threshold(180) // binarization, adjust value if needed
      .trim() // auto-crop borders loosely
      .toFile(outputPath);
      
    // Send back the processed filename to be used/previewed
    res.json({ filename: outputFilename });
  } catch (err) {
    console.error('Preprocessing error:', err);
    res.status(500).json({ error: 'Failed to enhance image.' });
  }
});

module.exports = router;
