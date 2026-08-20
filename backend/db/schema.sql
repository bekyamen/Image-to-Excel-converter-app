-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT now(),
    free_conversions_used INT DEFAULT 0,
    plan            VARCHAR(20) DEFAULT 'free' -- free | payg | bundle
);



CREATE TABLE IF NOT EXISTS conversions (
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

CREATE TABLE IF NOT EXISTS payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    amount_birr     NUMERIC(10,2) NOT NULL,
    gateway         VARCHAR(20), -- chapa | webirr | telebirr
    gateway_ref     VARCHAR(100),
    status          VARCHAR(20) DEFAULT 'pending', -- pending | confirmed | failed
    conversions_granted INT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversions_user ON conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
