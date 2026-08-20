# System Architecture — Image-to-Excel Converter

**Stack:** Next.js (frontend) · Node.js/Express (backend) · PostgreSQL (database)
**Payment gateway:** TBD (Chapa vs WeBirr — decide later)

---

## 1. High-Level Architecture Diagram

```
                                   ┌─────────────────────────┐
                                   │        CLIENT            │
                                   │   (Browser / Mobile web) │
                                   └────────────┬─────────────┘
                                                │ HTTPS
                                                ▼
                                   ┌─────────────────────────┐
                                   │      NEXT.JS FRONTEND    │
                                   │  - Upload UI              │
                                   │  - Editable table preview │
                                   │  - Auth (phone/OTP) UI    │
                                   │  - Pricing/history pages  │
                                   └────────────┬─────────────┘
                                                │ REST API (JSON)
                                                ▼
                        ┌───────────────────────────────────────────┐
                        │           NODE.JS / EXPRESS BACKEND         │
                        │                                              │
                        │   ┌────────────┐  ┌────────────┐  ┌───────┐ │
                        │   │ Auth        │  │ Convert     │  │ User  │ │
                        │   │ Service     │  │ Service     │  │ Service│ │
                        │   └────────────┘  └────┬───────┘  └───────┘ │
                        │                          │                    │
                        │                    ┌─────▼──────┐             │
                        │                    │ OCR Engine  │             │
                        │                    │ (Tesseract) │             │
                        │                    └─────┬──────┘             │
                        │                          │                    │
                        │                    ┌─────▼──────┐             │
                        │                    │ Table       │             │
                        │                    │ Parser      │             │
                        │                    │ (rows/cols) │             │
                        │                    └─────┬──────┘             │
                        │                          │                    │
                        │                    ┌─────▼──────┐             │
                        │                    │ Excel       │             │
                        │                    │ Exporter    │             │
                        │                    │ (xlsx lib)  │             │
                        │                    └────────────┘             │
                        │                                              │
                        │   ┌────────────┐  ┌─────────────────────┐   │
                        │   │ Payment     │  │ File Storage         │   │
                        │   │ Service     │  │ Handler              │   │
                        │   │ (TBD)       │  │ (temp local/S3)      │   │
                        │   └────────────┘  └─────────────────────┘   │
                        └──────────────┬───────────────┬───────────────┘
                                       │               │
                                       ▼               ▼
                          ┌────────────────────┐  ┌──────────────────┐
                          │   PostgreSQL DB      │  │  Temp File Store  │
                          │  users, conversions,  │  │ (deleted after    │
                          │  payments             │  │  processing)       │
                          └────────────────────┘  └──────────────────┘
                                       │
                                       ▼
                          ┌────────────────────┐
                          │  Payment Gateway     │
                          │  (Chapa/WeBirr - TBD)│
                          │  external API call   │
                          └────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Frontend — Next.js
| Responsibility | Detail |
|---|---|
| Upload UI | Drag/drop or camera capture, sends image to backend |
| Editable preview | Grid component showing extracted table, user can fix OCR errors before export |
| Auth UI | Phone number + OTP flow (simplest for local users, no email/password needed) |
| History page | List of past conversions, re-download option |
| Pricing page | Free tier limits, bundle pricing in birr |
| Account page | Usage remaining, plan status |

**Deployment note:** Since most logic lives server-side, this can be deployed as a lightweight Next.js app (Vercel or self-hosted) that only talks to your API — no heavy server-side rendering requirements.

### 2.2 Backend — Node.js/Express
Organized as internal services (not full microservices — one Express app, logically separated):

| Service | Responsibility |
|---|---|
| **Auth Service** | OTP send/verify, session/JWT issuance |
| **Convert Service** | Orchestrates: receive image → preprocess → OCR → parse → return JSON |
| **User Service** | Usage tracking, plan status, free-conversion counting |
| **Payment Service** | Abstracted interface — swappable gateway (decide Chapa vs WeBirr later without touching other code) |
| **File Storage Handler** | Temporary storage of uploaded images; deleted after processing (privacy + cost control) |

### 2.3 OCR Pipeline (internal to Convert Service)
```
Image upload
   │
   ▼
Preprocessing (deskew, grayscale, contrast) — OpenCV/sharp
   │
   ▼
OCR (Tesseract) — extracts raw text + word bounding boxes
   │
   ▼
Table Parser — groups words into rows/columns using position data
   │
   ▼
Structured JSON { headers: [...], rows: [[...]] }
   │
   ▼
Returned to frontend for editable preview
   │
   ▼ (after user edits, on export)
Excel Exporter (xlsx library) — generates .xlsx buffer
   │
   ▼
Returned to frontend as downloadable file
```

### 2.4 Database — PostgreSQL
Three core tables (see full schema in the app documentation doc):
- `users` — phone number, plan, free conversions used
- `conversions` — one row per upload attempt, status, engine used
- `payments` — transaction records, linked to gateway reference (gateway-agnostic fields so it works with either Chapa or WeBirr later)

### 2.5 Payment Gateway — Deferred
The **Payment Service** in the backend is built as an abstraction layer:

```javascript
class PaymentProvider {
  async initiate(userId, amountBirr) {}
  async verify(transactionRef) {}
}
// Later: class ChapaProvider extends PaymentProvider { ... }
// Later: class WeBirrProvider extends PaymentProvider { ... }
```

This means the rest of the system (user plan upgrades, usage limits, database records) doesn't need to know which gateway is used underneath — you can decide and swap this later without redesigning anything else.

---

## 3. Data Flow — Full Request Lifecycle (Free Conversion)

1. User opens Next.js app, logs in via phone/OTP
2. User uploads an image
3. Frontend sends `POST /api/convert` with the image
4. Backend checks `users.free_conversions_used` in PostgreSQL
5. If under limit → preprocess image → run Tesseract OCR → parse into table JSON
6. Backend saves a `conversions` record, returns table JSON to frontend
7. Frontend renders editable grid
8. User edits if needed, clicks "Download"
9. Frontend calls `POST /api/convert/:id/export` with final (possibly edited) data
10. Backend generates `.xlsx` buffer, returns as file download
11. Temp uploaded image is deleted from storage

## 4. Data Flow — Paid Conversion (once payment gateway is chosen)

1. Steps 1–4 same as above
2. If free limit reached → backend returns `402 Payment Required`
3. Frontend redirects to `/pricing`, user selects a bundle
4. Frontend calls `POST /api/payments/initiate`
5. Backend calls chosen gateway's API (Chapa or WeBirr) via the abstraction layer, gets a payment URL/code
6. User completes payment on gateway's page/app
7. Gateway calls `POST /api/payments/webhook` to confirm
8. Backend updates `payments` table and increments user's available conversions
9. User retries the conversion flow (steps 3–11 above)

---

## 5. Deployment View (suggested, simple first version)

```
┌───────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ Vercel / Netlify│    │ Render / Railway /  │    │ Managed Postgres  │
│  (Next.js)      │───▶│ VPS (Node backend)  │───▶│ (Render/Supabase/ │
│                 │    │                     │    │  Railway)         │
└───────────────┘     └───────────────────┘     └──────────────────┘
```

For an MVP with low traffic, a single small VPS or a managed platform (Render/Railway) running both frontend and backend is enough — no need for Kubernetes, load balancers, or multi-region setup at this stage.

---

## 6. Security & Privacy Notes
- Uploaded images should be deleted immediately after successful OCR (don't retain user data longer than necessary — especially relevant if screenshots contain financial/business info)
- Use HTTPS everywhere (enforced by hosting provider by default on Vercel/Render)
- Store only hashed/JWT session tokens, never raw OTPs, in the database
- Rate-limit the `/api/convert` endpoint to prevent abuse of free tier (e.g., by IP + phone number)

---

## 7. What's Deferred / To Decide Later
- **Payment gateway** — Chapa vs WeBirr (or both), pending your review
- **File storage** — local disk is fine for MVP; move to S3-compatible storage (e.g., Cloudflare R2, cheap and no egress fees) only if traffic grows
- **OCR upgrade path** — Tesseract now, optional Google Document AI premium mode later, funded by revenue
