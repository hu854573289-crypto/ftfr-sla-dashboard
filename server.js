require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json({ limit: '25mb' }));

// ---------- Password protection (HTTP Basic Auth) ----------
// This runs on the server, before any page or API response is sent, so
// unlike a password check baked into the frontend HTML/JS, the page content
// and data are never sent to an unauthenticated browser in the first place.
// The password can be overridden via the DASHBOARD_PASSWORD env var (set it
// in Render's Environment settings) without touching this file. Any
// username is accepted — only the password is checked.
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'Mindray99!';
app.use((req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (password === DASHBOARD_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="FTFR SLA Dashboard"');
  res.status(401).send('Password required.');
});

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable. Set it in .env (local) or in your Render service settings.');
} else {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err.message));
}

// ---------- Schemas ----------
// Tickets: the imported Excel rows. Kept schemaless-ish (strict:false) so
// new columns added later don't require a code change to store them.
const ticketSchema = new mongoose.Schema(
  {
    orderNo: { type: String, index: true },
  },
  { strict: false, versionKey: false }
);
const Ticket = mongoose.model('Ticket', ticketSchema);

// Annotations: one document per overdue ticket, keyed by Order No.
const annotationSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true, index: true },
    category: String,
    reason: String,
    cause: String,
    actionText: String,
    note: String,
    updatedAt: String,
  },
  { versionKey: false }
);
const Annotation = mongoose.model('Annotation', annotationSchema);

// ---------- API ----------
// GET all tickets currently stored.
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find({}, { _id: 0, __v: 0 }).lean();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT replaces the entire ticket dataset (used on Excel import / clear).
app.put('/api/tickets', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'Body must be a JSON array of ticket rows' });
    }
    await Ticket.deleteMany({});
    if (rows.length) {
      // orderNo is coerced to a string so lookups/joins with annotations
      // (also keyed by string orderNo) are consistent.
      const docs = rows.map((r) => ({ ...r, orderNo: r.orderNo != null ? String(r.orderNo) : null }));
      await Ticket.insertMany(docs, { ordered: false });
    }
    res.json({ ok: true, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE clears all tickets (annotations are left untouched on purpose —
// they're keyed by Order No. and should survive a re-import).
app.delete('/api/tickets', async (req, res) => {
  try {
    await Ticket.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all annotations as a { [orderNo]: {...} } map (what the frontend expects).
app.get('/api/annotations', async (req, res) => {
  try {
    const list = await Annotation.find({}, { _id: 0, __v: 0 }).lean();
    const map = {};
    list.forEach((a) => {
      map[a.orderNo] = a;
    });
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT replaces the whole annotations map in one call (simplest for the
// frontend, which keeps the full map in memory and re-sends it on every edit).
app.put('/api/annotations', async (req, res) => {
  try {
    const map = req.body;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return res.status(400).json({ error: 'Body must be a JSON object keyed by orderNo' });
    }
    const orderNos = Object.keys(map);
    await Annotation.deleteMany({});
    if (orderNos.length) {
      const docs = orderNos.map((orderNo) => ({ orderNo, ...map[orderNo] }));
      await Annotation.insertMany(docs, { ordered: false });
    }
    res.json({ ok: true, count: orderNos.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT upserts a single annotation (handy for scripts/integrations; the
// bundled frontend uses the bulk endpoint above instead).
app.put('/api/annotations/:orderNo', async (req, res) => {
  try {
    const { orderNo } = req.params;
    const { category, reason, cause, actionText, note } = req.body;
    const updatedAt = new Date().toISOString();
    const doc = await Annotation.findOneAndUpdate(
      { orderNo },
      { orderNo, category, reason, cause, actionText, note, updatedAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/annotations/:orderNo', async (req, res) => {
  try {
    await Annotation.deleteOne({ orderNo: req.params.orderNo });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple health check for Render / uptime monitors.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mongoState: mongoose.connection.readyState });
});

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FTFR SLA dashboard server running on port ${PORT}`));
