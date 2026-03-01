const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Simple JSON "database" ────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'db.json');
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { users: [], items: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ─── Multer for image uploads ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'lostfound-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Auth middleware ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}

// ─── Email setup ───────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'your-college-email@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-app-password'
    }
  });
}

async function sendMatchEmail(toEmail, toName, foundItem, lostItem) {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: '"College Lost & Found" <noreply@college.edu>',
      to: toEmail,
      subject: '🎉 Possible Match Found for Your Lost Item!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 10px;">
          <h2 style="color: #1a1a2e; text-align: center;">Lost & Found – Match Alert!</h2>
          <p>Hi <strong>${toName}</strong>,</p>
          <p>Great news! Someone found an item that matches your lost item.</p>
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #e94560;">
            <h3>Your Lost Item</h3>
            <p><strong>Title:</strong> ${lostItem.title}</p>
            <p><strong>Category:</strong> ${lostItem.category}</p>
            <p><strong>Description:</strong> ${lostItem.description}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #0f3460;">
            <h3>Possible Match Found</h3>
            <p><strong>Title:</strong> ${foundItem.title}</p>
            <p><strong>Category:</strong> ${foundItem.category}</p>
            <p><strong>Location Found:</strong> ${foundItem.location}</p>
            <p><strong>Description:</strong> ${foundItem.description}</p>
            <p><strong>Found by:</strong> ${foundItem.uploaderName}</p>
          </div>
          <p>Please login to the Lost & Found portal to claim your item: <a href="http://localhost:3000">Click Here</a></p>
          <p style="color: #888; font-size: 12px;">This is an automated message from your College Lost & Found System.</p>
        </div>
      `
    });
    console.log(`Match email sent to ${toEmail}`);
  } catch (err) {
    console.log('Email sending failed (configure EMAIL_USER and EMAIL_PASS):', err.message);
  }
}

// ─── Check for matches ─────────────────────────────────────────────────────
function checkForMatches(newItem) {
  const db = loadDB();
  const oppositeType = newItem.type === 'found' ? 'lost' : 'found';
  const potentialMatches = db.items.filter(item =>
    item.type === oppositeType &&
    item.category === newItem.category &&
    item.id !== newItem.id
  );

  for (const match of potentialMatches) {
    const foundItem = newItem.type === 'found' ? newItem : match;
    const lostItem = newItem.type === 'lost' ? newItem : match;
    const lostUser = db.users.find(u => u.id === lostItem.userId);
    if (lostUser) {
      sendMatchEmail(lostUser.email, lostUser.name, foundItem, lostItem);
    }
  }
  return potentialMatches;
}

// ─── API Routes ────────────────────────────────────────────────────────────

// Register
app.post('/api/register', (req, res) => {
  const { name, email, dob, rollNumber, department } = req.body;
  if (!name || !email || !dob) return res.json({ success: false, message: 'All fields required' });

  const db = loadDB();
  if (db.users.find(u => u.email === email)) {
    return res.json({ success: false, message: 'Email already registered' });
  }

  const user = { id: uuidv4(), name, email, dob, rollNumber, department, createdAt: new Date().toISOString() };
  db.users.push(user);
  saveDB(db);
  res.json({ success: true, message: 'Registration successful! Your password is your date of birth.' });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.email === email);

  if (!user) return res.json({ success: false, message: 'Email not registered' });
  if (user.dob !== password) return res.json({ success: false, message: 'Incorrect password (use your Date of Birth: YYYY-MM-DD)' });

  req.session.user = { id: user.id, name: user.name, email: user.email };
  res.json({ success: true, message: 'Login successful', user: req.session.user });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/me', (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

// Upload item
app.post('/api/items', requireAuth, upload.single('image'), (req, res) => {
  const { title, category, type, description, location, date } = req.body;
  if (!title || !category || !type) return res.json({ success: false, message: 'Required fields missing' });

  const db = loadDB();
  const item = {
    id: uuidv4(),
    userId: req.session.user.id,
    uploaderName: req.session.user.name,
    uploaderEmail: req.session.user.email,
    title, category, type, description, location,
    date: date || new Date().toISOString().split('T')[0],
    image: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  db.items.push(item);
  saveDB(db);

  const matches = checkForMatches(item);
  res.json({ success: true, item, matchCount: matches.length, message: matches.length > 0 ? `Item posted! Found ${matches.length} possible match(es). Email notifications sent!` : 'Item posted successfully!' });
});

// Get all items
app.get('/api/items', (req, res) => {
  const { category, type, search } = req.query;
  const db = loadDB();
  let items = db.items.filter(i => i.status === 'active');

  if (category && category !== 'all') items = items.filter(i => i.category === category);
  if (type && type !== 'all') items = items.filter(i => i.type === type);
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(i => i.title.toLowerCase().includes(q) || (i.description && i.description.toLowerCase().includes(q)));
  }

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, items });
});

// Resolve item
app.patch('/api/items/:id/resolve', requireAuth, (req, res) => {
  const db = loadDB();
  const item = db.items.find(i => i.id === req.params.id);
  if (!item) return res.json({ success: false, message: 'Item not found' });
  if (item.userId !== req.session.user.id) return res.json({ success: false, message: 'Unauthorized' });
  item.status = 'resolved';
  saveDB(db);
  res.json({ success: true });
});

// Get matches for an item
app.get('/api/items/:id/matches', requireAuth, (req, res) => {
  const db = loadDB();
  const item = db.items.find(i => i.id === req.params.id);
  if (!item) return res.json({ success: false, message: 'Item not found' });

  const oppositeType = item.type === 'found' ? 'lost' : 'found';
  const matches = db.items.filter(i =>
    i.type === oppositeType &&
    i.category === item.category &&
    i.status === 'active'
  );
  res.json({ success: true, matches });
});

// ─── Serve HTML pages ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/upload', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload.html')));

app.listen(PORT, () => {
  console.log(`\n🎒 College Lost & Found running at http://localhost:${PORT}\n`);
  console.log('📧 To enable emails, set environment variables:');
  console.log('   EMAIL_USER=your-email@gmail.com');
  console.log('   EMAIL_PASS=your-gmail-app-password\n');
});