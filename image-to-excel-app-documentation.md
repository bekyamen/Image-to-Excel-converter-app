# Image-to-Excel Converter — Technical Documentation

**Stack:** Next.js (frontend) · Node.js/Express (backend) · PostgreSQL (database)
**Core problem solved:** Turn a photo/screenshot of a table into an editable Excel (.xlsx) file in seconds.

---

## 1. Product Overview

### 1.1 Target users
- Small business owners / resellers (supplier price lists via WhatsApp/Telegram screenshots)
- Accountants / bookkeepers (receipts, invoices, statements)
- Students / researchers (tables from textbooks, PDFs, reports)

### 1.2 MVP scope (build this first, nothing more)
1. User uploads an image (JPG/PNG) or screenshot
2. Backend runs OCR + table structure detection
3. User sees an **editable preview** of the extracted table (critical — don't skip this, it's how you cover for imperfect OCR)
4. User downloads as `.xlsx`
5. Usage limits: e.g. 3 free conversions/month, then pay-per-use or bundle
6. Payment via local gateway (WeBirr/Telebirr) once limit is hit

**Explicitly out of scope for v1:** login/auth complexity beyond phone number, batch upload, forum/community features, multi-language UI, team accounts.

---

## 2. System Architecture

```
┌─────────────┐      HTTPS       ┌──────────────┐      SQL       ┌────────────┐
│   Next.js    │ ───────────────▶ │  Node/Express │ ─────────────▶ │ PostgreSQL │
│  (Frontend)  │ ◀─────────────── │   (Backend)   │ ◀───────────── │            │
└─────────────┘      JSON        └──────┬───────┘                └────────────┘
                                          │
                          ┌───────────────┼────────────────┐
                          ▼               ▼                ▼
                    ┌───────────┐  ┌─────────────┐  ┌──────────────┐
                    │ Tesseract │  │ File Storage │  │ Payment      │
                    │  (OCR)    │  │ (local/S3)   │  │ Gateway      │
                    └───────────┘  └─────────────┘  │ (WeBirr etc) │
                                                      └──────────────┘
```

### 2.1 Why this shape
- **Next.js** handles upload UI, editable table preview, and download — server-side rendering not critical here, so it can even be deployed as a mostly-client app calling your API.
- **Node/Express** does the heavy lifting: receives image, runs OCR pipeline, returns structured JSON (rows/columns), generates `.xlsx` on request.
- **PostgreSQL** stores users, usage counts, conversion history, and payment records — not the images themselves (store those in local disk temporarily or S3-compatible storage, then delete).

---

## 3. Database Schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT now(),
    free_conversions_used INT DEFAULT 0,
    plan            VARCHAR(20) DEFAULT 'free' -- free | payg | bundle
);

-- Conversions (each upload → extraction attempt)
CREATE TABLE conversions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    original_filename VARCHAR(255),
    status          VARCHAR(20) DEFAULT 'pending', -- pending | success | failed
    ocr_engine      VARCHAR(20) DEFAULT 'tesseract', -- tesseract | document_ai
    row_count       INT,
    column_count    INT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- Payments
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    amount_birr     NUMERIC(10,2) NOT NULL,
    gateway         VARCHAR(20), -- webirr | telebirr | cbebirr
    gateway_ref     VARCHAR(100), -- transaction ID from gateway
    status          VARCHAR(20) DEFAULT 'pending', -- pending | confirmed | failed
    conversions_granted INT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_conversions_user ON conversions(user_id);
CREATE INDEX idx_payments_user ON payments(user_id);
```

---

## 4. Backend API (Node/Express)

### 4.1 Endpoints

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/otp/send` | Send OTP to phone number (simplest auth for local users, no email/password) |
| `POST` | `/api/auth/otp/verify` | Verify OTP, return session token |
| `POST` | `/api/convert` | Upload image, run OCR, return structured table JSON (not the file yet) |
| `POST` | `/api/convert/:id/export` | Generate and return `.xlsx` from the (possibly user-edited) table JSON |
| `GET`  | `/api/convert/history` | List user's past conversions |
| `POST` | `/api/payments/initiate` | Start a payment (WeBirr/Telebirr) for extra conversions |
| `POST` | `/api/payments/webhook` | Gateway calls this to confirm payment succeeded |
| `GET`  | `/api/user/usage` | Return remaining free conversions / plan status |

### 4.2 Example: `/api/convert` flow

```javascript
// POST /api/convert
// 1. Receive image (multipart/form-data)
// 2. Check user's remaining free conversions (query PostgreSQL)
// 3. Preprocess image (deskew, grayscale, contrast) — improves Tesseract accuracy
// 4. Run OCR + table structure detection
// 5. Return structured JSON, NOT a file yet — frontend shows editable preview first

const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.post('/convert', upload.single('image'), async (req, res) => {
  try {
    const userId = req.user.id;
    const usage = await checkUserUsage(userId); // query DB
    if (usage.remaining <= 0) {
      return res.status(402).json({ error: 'No conversions left. Please pay to continue.' });
    }

    const preprocessed = await preprocessImage(req.file.path); // OpenCV: deskew, grayscale
    const tableData = await runOCR(preprocessed); // Tesseract call, returns rows/columns

    const conversion = await saveConversionRecord(userId, req.file.originalname, tableData);

    res.json({ conversionId: conversion.id, table: tableData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Conversion failed. Please try a clearer image.' });
  }
});

module.exports = router;
```

### 4.3 OCR pipeline (Tesseract, free tier of your product)

```javascript
const Tesseract = require('tesseract.js');
const cv = require('opencv4nodejs'); // or use sharp for lighter preprocessing

async function preprocessImage(imagePath) {
  const img = cv.imread(imagePath);
  const gray = img.bgrToGray();
  const deskewed = deskewImage(gray); // custom function using Hough transform
  const outputPath = imagePath + '_processed.png';
  cv.imwrite(outputPath, deskewed);
  return outputPath;
}

async function runOCR(imagePath) {
  const { data } = await Tesseract.recognize(imagePath, 'eng', {
    logger: m => console.log(m) // progress logging
  });
  // data.text gives raw text — you still need row/column parsing logic
  // (split by line breaks, detect column boundaries by spacing/position)
  return parseTextIntoTable(data);
}
```

> **Note:** Table structure detection (turning raw OCR text into clean rows/columns) is the hard part — plan real dev time here. Consider `data.words` with bounding-box coordinates from Tesseract to group text into columns by x-position, not just raw text splitting.

### 4.4 Excel export

```javascript
const XLSX = require('xlsx');

function generateExcelFile(tableData) {
  const worksheet = XLSX.utils.aoa_to_sheet(tableData.rows); // array of arrays
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Data');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
```

---

## 5. Frontend (Next.js)

### 5.1 Key pages/components

| Page | Purpose |
|---|---|
| `/` | Upload screen — drag/drop or camera capture |
| `/convert/[id]` | Editable table preview (spreadsheet-like grid) before export |
| `/history` | Past conversions list |
| `/pricing` | Free tier limits + bundle pricing in birr |
| `/account` | Phone-based login, usage remaining |

### 5.2 Editable preview component (important UX piece)
Use a lightweight editable grid library (e.g. `react-data-grid` or `handsontable`) so users can fix OCR mistakes inline before downloading. This is your main defense against imperfect Tesseract output — don't skip it.

```jsx
// pages/convert/[id].js
import { useState, useEffect } from 'react';
import DataGrid from 'react-data-grid';

export default function ConvertPreview({ conversionId }) {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);

  useEffect(() => {
    fetch(`/api/convert/${conversionId}`)
      .then(res => res.json())
      .then(data => {
        setColumns(data.table.headers.map(h => ({ key: h, name: h, editable: true })));
        setRows(data.table.rows);
      });
  }, [conversionId]);

  const handleExport = async () => {
    const res = await fetch(`/api/convert/${conversionId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }) // send user-edited data
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted.xlsx';
    a.click();
  };

  return (
    <div>
      <DataGrid columns={columns} rows={rows} onRowsChange={setRows} />
      <button onClick={handleExport}>Download Excel</button>
    </div>
  );
}
```

---

## 6. Payment Integration (Local, birr-based)

### 6.1 Recommended approach
Use **WeBirr** (single integration covers CBE, Telebirr, Awash, Abyssinia, Bunna) instead of integrating each bank separately. Build your payment logic behind an abstraction layer so you can swap/add providers later without rewriting business logic.

```javascript
// services/paymentProvider.js — abstraction layer
class PaymentProvider {
  async initiate(userId, amountBirr) { throw new Error('Not implemented'); }
  async verify(transactionRef) { throw new Error('Not implemented'); }
}

class WeBirrProvider extends PaymentProvider {
  async initiate(userId, amountBirr) {
    // call WeBirr API, return payment URL/reference
  }
  async verify(transactionRef) {
    // confirm payment status via WeBirr API or webhook
  }
}

module.exports = { WeBirrProvider };
```

### 6.2 Pricing model recommendation
- Free: 3 conversions/month
- Bundle: e.g. 50 birr for 20 conversions/month (better margin than per-use micro-payments, fewer gateway fees)
- Price must cover: API cost (near-zero on Tesseract, ~0.2 birr/image on Document AI) + gateway fee (~1.5-3%) + your margin

---

## 7. Build Order (Recommended Sequence)

| Phase | What to build | Cost |
|---|---|---|
| 1 | Upload → Tesseract OCR → editable preview → Excel export (no auth, no payment) | Free |
| 2 | Add phone-based auth + usage tracking in Postgres | Free |
| 3 | Test with 15-20 real users via direct outreach | Free |
| 4 | Add WeBirr payment integration once demand is validated | Free (gateway takes % per transaction) |
| 5 | Add optional Document AI "premium accuracy mode" as paid upsell for hard images | Pay-as-you-go, funded by revenue |

---

## 8. Environment Variables (`.env`)

```
DATABASE_URL=postgresql://user:password@localhost:5432/img2excel
JWT_SECRET=your_secret_here
WEBIRR_API_KEY=your_webirr_key
WEBIRR_MERCHANT_ID=your_merchant_id
GOOGLE_DOCUMENT_AI_KEY=only_needed_in_phase_5
NODE_ENV=development
```

---

## 9. Suggested Folder Structure

```
project-root/
├── frontend/               # Next.js app
│   ├── pages/
│   ├── components/
│   └── ...
├── backend/                 # Node/Express app
│   ├── routes/
│   ├── services/
│   │   ├── ocr.js
│   │   ├── paymentProvider.js
│   │   └── excelExport.js
│   ├── db/
│   │   ├── migrations/
│   │   └── schema.sql
│   └── server.js
└── README.md
```

---

## 10. Notes / Open Risks to Revisit
- Table structure detection from raw OCR text is the hardest engineering piece — budget real time for it, not just OCR itself.
- Confirm current WeBirr onboarding requirements and fees directly with them before building the payment layer.
- Once you have paying users, verify current Google Document AI free-tier and pricing directly on Google's official pricing page (pricing shifts and third-party summaries can be outdated).
