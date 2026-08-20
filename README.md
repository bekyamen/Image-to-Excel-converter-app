# Image → Excel Converter (MVP)

Upload a photo of a table (price list, receipt, etc.) and get back an editable,
downloadable Excel file. Built with Next.js, Node/Express, and Tesseract OCR.

This is the **free-tier MVP**: no login, no payment, no database wired in yet —
just the core working flow: upload → OCR → editable preview → download.
Auth, usage limits, and payments are documented (see `backend/db/schema.sql`
and the architecture docs) but intentionally left out of this first cut so
you can test the core idea with real users fast.

---

## What's included

```
img2excel/
├── backend/            Node/Express API
│   ├── routes/convert.js       Upload, OCR, export endpoints
│   ├── services/ocr.js         Tesseract OCR + row/column parsing logic
│   ├── services/excelExport.js .xlsx file generation
│   ├── db/schema.sql            PostgreSQL schema (for Phase 2: auth/usage/payments)
│   └── server.js
└── frontend/            Next.js app
    ├── pages/index.js           Upload + editable preview + download
    ├── components/EditableTable.js
    └── styles/globals.css
```

Both the OCR row/column grouping logic and the Excel export were tested
directly during development and confirmed working correctly.

---

## Running it locally

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Backend runs on `http://localhost:4000`. Health check: `GET /api/health`.

> Note: the first time Tesseract runs, it downloads its English language
> data file from the internet (a few MB). This requires your machine to
> have internet access — after the first run it's cached locally.

### 2. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000` and proxies `/api/*` calls to the
backend automatically (see `next.config.js`).

### 3. Try it

Open `http://localhost:3000`, upload a clear photo of a simple table
(a price list, a receipt, anything with rows and columns), review/fix the
extracted data in the editable grid, and download the `.xlsx` file.

---

## How the OCR → table logic works

1. Tesseract returns each recognized word with its bounding box (x/y position)
2. Words are grouped into **rows** by clustering on similar vertical position
3. Words are grouped into **columns** by matching horizontal position against
   the row with the most words (used as the column reference)
4. Result: a clean `{ headers, rows }` JSON structure, editable in the UI
   before export

This is a heuristic — it works well on clean, simple, roughly-aligned tables
(most phone screenshots of price lists, receipts, etc.). Skewed photos,
merged cells, or very messy layouts will need manual correction in the
preview — which is exactly why the editable step exists.

---

## What's NOT built yet (by design, for this first pass)

- **Auth** — phone/OTP login (schema exists in `db/schema.sql`, not wired up)
- **Usage limits / free tier tracking** — `users.free_conversions_used` column
  exists in the schema but isn't enforced yet
- **Payment gateway** — Chapa vs WeBirr decision is still open; `payments`
  table exists in the schema, ready for whichever you choose
- **Image preprocessing** (deskew/contrast) — would improve Tesseract accuracy
  further; worth adding once you see what real user photos look like
- **Google Document AI "premium mode"** — for harder images, once revenue
  justifies the API cost

## Suggested next steps

1. Run it locally, test with 5-10 of your own real table photos
2. Fix the table-parsing logic based on what actually breaks (this is
   normal — table detection is the hardest part, expect to iterate)
3. Share the free version with 10-20 real users (per the earlier outreach
   plan) before adding auth/payments
4. Once validated, wire up the database, auth, and chosen payment gateway
