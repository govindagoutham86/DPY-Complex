require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { sendInquiryNotification } = require('./mailer');

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));

const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: corsOrigin }));

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many enquiries from this device. Please try again later.' }
});

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value) {
  return typeof value === 'string' && /^\+?[0-9][0-9\s().-]{7,19}$/.test(value.trim());
}

const allowedStatuses = ['available', 'leased', 'coming_soon'];
const allowedInquiryStatuses = ['new', 'contacted', 'closed'];

// ---------- Health ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'DPY Complex API' });
});

// ---------- Shops (public, database-backed) ----------
app.get('/api/shops', (req, res) => {
  const { status, category, floor } = req.query;
  let query = 'SELECT * FROM shops WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (floor) { query += ' AND floor = ?'; params.push(floor); }

  query += ` ORDER BY CASE floor WHEN 'Ground' THEN 1 WHEN 'First' THEN 2 ELSE 3 END, unit_no`;
  res.json(db.prepare(query).all(...params));
});

app.get('/api/shops/:id', (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json(shop);
});

// ---------- Shops (admin) ----------
app.post('/api/admin/shops', requireAdmin, (req, res) => {
  const unit_no = cleanString(req.body.unit_no, 30);
  const name = cleanString(req.body.name, 150);
  const category = cleanString(req.body.category, 100);
  const size_sqft = Number(req.body.size_sqft);
  const floor = cleanString(req.body.floor, 30);
  const status = cleanString(req.body.status || 'available', 20);
  const description = cleanString(req.body.description, 1000);

  if (!unit_no || !name || !category || !Number.isInteger(size_sqft) || size_sqft <= 0 || !floor) {
    return res.status(400).json({ error: 'unit_no, name, category, positive integer size_sqft, and floor are required' });
  }
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowedStatuses.join(', ')}` });
  }

  try {
    const result = db.prepare(`
      INSERT INTO shops (unit_no, name, category, size_sqft, floor, status, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(unit_no, name, category, size_sqft, floor, status, description);
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(shop);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A shop with this unit number already exists' });
    }
    throw err;
  }
});

app.put('/api/admin/shops/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Shop not found' });

  const updates = {
    unit_no: cleanString(req.body.unit_no ?? existing.unit_no, 30),
    name: cleanString(req.body.name ?? existing.name, 150),
    category: cleanString(req.body.category ?? existing.category, 100),
    size_sqft: Number(req.body.size_sqft ?? existing.size_sqft),
    floor: cleanString(req.body.floor ?? existing.floor, 30),
    status: cleanString(req.body.status ?? existing.status, 20),
    description: cleanString(req.body.description ?? existing.description, 1000)
  };

  if (!updates.unit_no || !updates.name || !updates.category || !Number.isInteger(updates.size_sqft) || updates.size_sqft <= 0 || !updates.floor) {
    return res.status(400).json({ error: 'unit_no, name, category, positive integer size_sqft, and floor are required' });
  }
  if (!allowedStatuses.includes(updates.status)) {
    return res.status(400).json({ error: `status must be one of ${allowedStatuses.join(', ')}` });
  }

  try {
    db.prepare(`
      UPDATE shops
      SET unit_no=?, name=?, category=?, size_sqft=?, floor=?, status=?, description=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      updates.unit_no, updates.name, updates.category, updates.size_sqft,
      updates.floor, updates.status, updates.description, req.params.id
    );
    res.json(db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A shop with this unit number already exists' });
    }
    throw err;
  }
});

app.delete('/api/admin/shops/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM shops WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Shop not found' });
  res.status(204).send();
});

// ---------- Inquiries (public submit) ----------
app.post('/api/inquiries', inquiryLimiter, async (req, res) => {
  const name = cleanString(req.body.name, 100);
  const company = cleanString(req.body.company, 150);
  const phone = cleanString(req.body.phone, 30);
  const email = cleanString(req.body.email, 254).toLowerCase();
  const category = cleanString(req.body.category, 100);
  const preferred_size = cleanString(req.body.preferred_size, 100);
  const message = cleanString(req.body.message, 2000);
  const shop_id = req.body.shop_id === '' || req.body.shop_id === null || req.body.shop_id === undefined
    ? null
    : Number(req.body.shop_id);

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }
  if (name.length < 2) {
    return res.status(400).json({ error: 'Please provide your full name.' });
  }
  if (!isPhone(phone)) {
    return res.status(400).json({ error: 'Please provide a valid phone number.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (shop_id !== null && (!Number.isInteger(shop_id) || shop_id <= 0)) {
    return res.status(400).json({ error: 'Invalid shop selection.' });
  }
  if (shop_id !== null) {
    const selectedShop = db.prepare('SELECT id FROM shops WHERE id = ?').get(shop_id);
    if (!selectedShop) return res.status(400).json({ error: 'Selected shop does not exist.' });
  }

  const stmt = db.prepare(`
    INSERT INTO inquiries (name, company, phone, email, category, preferred_size, message, shop_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name, company || null, phone, email,
    category || null, preferred_size || null, message || null, shop_id
  );
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(result.lastInsertRowid);

  let emailResult;
  try {
    emailResult = await sendInquiryNotification(inquiry);
  } catch (err) {
    console.error('[mailer] unexpected failure:', err.message);
    emailResult = { sent: false, teamSent: false, customerSent: false, reason: 'mailer_error' };
  }

  const emailWarning = emailResult.sent
    ? null
    : 'Your enquiry was saved successfully, but email notification is currently unavailable.';

  res.status(201).json({
    message: 'Enquiry received',
    inquiryId: inquiry.id,
    emailSent: emailResult.sent,
    emailWarning
  });
});

// ---------- Inquiries (admin) ----------
app.get('/api/admin/inquiries', requireAdmin, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM inquiries WHERE 1=1';
  const params = [];
  if (status) {
    if (!allowedInquiryStatuses.includes(status)) return res.status(400).json({ error: 'Invalid inquiry status' });
    query += ' AND status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.patch('/api/admin/inquiries/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!allowedInquiryStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowedInquiryStatuses.join(', ')}` });
  }
  const result = db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Inquiry not found' });
  res.json(db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id));
});

// Serve only the public website entry point. Do not expose backend files such as
// .env, server.js, db.js, or mailer.js through a static directory.
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(require('path').join(__dirname, 'index.html'));
});

// ---------- 404 + error handling ----------
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`DPY Complex backend running on port ${PORT}`);
});
