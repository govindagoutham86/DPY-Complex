const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Use an explicit DB_PATH in .env in production. The DPY Complex name is the
// default so the project uses its current DPY Complex name.
const dbPath = process.env.DB_PATH || './data/dpy-complex.db';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_no TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    size_sqft INTEGER NOT NULL,
    floor TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','leased','coming_soon')),
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    category TEXT,
    preferred_size TEXT,
    message TEXT,
    shop_id INTEGER,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL
  );
`);

// The six rows below are the original shop data from the supplied HTML.
// They are now the database source of truth, so the website displays these
// exact values on first run and then follows later database changes.
const originalHtmlShops = [
  { unit_no: 'G01', name: "Hotel Reddy's", category: 'Dine-In & restaurant', size_sqft: 1040, floor: 'Ground', status: 'leased', description: "Hotel Reddy's — Dine-In & restaurant." },
  { unit_no: 'G05', name: 'Coming soon', category: 'TBD', size_sqft: 920, floor: 'Ground', status: 'leased', description: 'Coming soon — category to be confirmed.' },
  { unit_no: 'G06', name: 'Game Zone', category: 'Entertainment', size_sqft: 3200, floor: 'Ground', status: 'leased', description: 'Game Zone — Entertainment.' },
  { unit_no: 'G07', name: 'Office', category: 'Salon & spa', size_sqft: 1100, floor: 'Ground', status: 'available', description: 'Office — Salon & spa.' },
  { unit_no: 'G08', name: 'Family entertainment bay', category: 'Leisure', size_sqft: 4600, floor: 'Ground', status: 'coming_soon', description: 'Family entertainment bay — Leisure.' },
  { unit_no: 'F09', name: 'Lifestyle homeware', category: 'Home & living', size_sqft: 1400, floor: 'First', status: 'available', description: 'Lifestyle homeware — Home & living.' }
];

const count = db.prepare('SELECT COUNT(*) AS c FROM shops').get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO shops (unit_no, name, category, size_sqft, floor, status, description)
    VALUES (@unit_no, @name, @category, @size_sqft, @floor, @status, @description)
  `);
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertMany(originalHtmlShops);
} else {
  // One-time migration for the original six placeholder rows shipped with the
  // old backend. Only rows matching the old seed values are migrated; other
  // existing/custom database data is left untouched.
  const legacySeed = [
    ['G01', 'Corner flagship', 'Fashion & apparel', 1850, 'Ground', 'available'],
    ['G04', 'Atrium-facing café', 'Food & beverage', 920, 'Ground', 'available'],
    ['G07', 'Anchor electronics', 'Electronics', 3200, 'Ground', 'leased'],
    ['F02', 'Wellness suite', 'Salon & spa', 1100, 'First', 'available'],
    ['F05', 'Family entertainment bay', 'Leisure', 4600, 'First', 'coming_soon'],
    ['F09', 'Lifestyle homeware', 'Home & living', 1400, 'First', 'available']
  ];

  const rows = db.prepare('SELECT id, unit_no, name, category, size_sqft, floor, status FROM shops').all();
  const isLegacy = rows.length === legacySeed.length && legacySeed.every((seed) => {
    return rows.some((r) => seed.every((value, i) => [r.unit_no, r.name, r.category, r.size_sqft, r.floor, r.status][i] === value));
  });

  if (isLegacy) {
    const update = db.prepare(`
      UPDATE shops
      SET name=@name, category=@category, size_sqft=@size_sqft, floor=@floor,
          status=@status, description=@description, updated_at=datetime('now')
      WHERE unit_no=@unit_no
    `);
    const migrate = db.transaction((items) => items.forEach((item) => update.run(item)));
    migrate(originalHtmlShops);
  }
}

module.exports = db;
