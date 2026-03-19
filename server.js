require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Connect to MongoDB ────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// ─── User Model ────────────────────────────────
const userSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  dob: { type: String, required: true },
  rollNumber: String,
  department: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ─── Item Model ────────────────────────────────
const itemSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  userId: String,
  uploaderName: String,
  uploaderEmail: String,
  title: { type: String, required: true },
  category: { type: String, required: true },
  type: { type: String, required: true, enum: ['lost', 'found'] },
  description: String,
  location: String,
  date: String,
  image: String,
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
const Item = mongoose.model('Item', itemSchema);

// ─── Image Upload Setup ────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => 
    cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// ─── Middleware ────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'college2024secretkey',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Auth Check ────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}

// ─── Send Match Email ──────────────────────────
async function sendMatchEmail(toEmail, toName, foundItem, lostItem) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    await transporter.sendMail({
      from: '"College Lost & Found" <noreply@college.edu>',
      to: toEmail,
      subject: '🎉 Match Found for Your Lost Item!',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;
        margin:0 auto;background:#f9f9f9;padding:20px;
        border-radius:10px;">
          <h2 style="color:#1a1a2e;text-align:center;">
            Lost & Found – Match Alert!
          </h2>
          <p>Hi <strong>${toName}</strong>,</p>
          <p>Someone found an item matching yours!</p>
          <div style="background:white;padding:15px;
          border-radius:8px;border-left:4px solid #e94560;">
            <h3>Your Lost Item</h3>
            <p><strong>Title:</strong> ${lostItem.title}</p>
            <p><strong>Category:</strong> ${lostItem.category}</p>
          </div>
          <div style="background:white;padding:15px;margin-top:10px;
          border-radius:8px;border-left:4px solid #0f3460;">
            <h3>Item Found</h3>
            <p><strong>Title:</strong> ${foundItem.title}</p>
            <p><strong>Location:</strong> ${foundItem.location}</p>
            <p><strong>Found by:</strong> ${foundItem.uploaderName}</p>
          </div>
          <p style="margin-top:15px;">
            Login to the portal to claim your item!
          </p>
        </div>
      `
    });
    console.log('✅ Email sent to ' + toEmail);
  } catch (err) {
    console.log('❌ Email failed:', err.message);
  }
}

// ─── Check Matches ─────────────────────────────
async function checkForMatches(newItem) {
  const oppositeType = newItem.type === 'found' ? 'lost' : 'found';
  const matches = await Item.find({
    type: oppositeType,
    category: newItem.category,
    status: 'active'
  });
  for (const match of matches) {
    const foundItem = newItem.type === 'found' ? newItem : match;
    const lostItem = newItem.type === 'lost' ? newItem : match;
    const lostUser = await User.findOne({ id: lostItem.userId });
    if (lostUser) {
      await sendMatchEmail(
        lostUser.email, 
        lostUser.name, 
        foundItem, 
        lostItem
      );
    }
  }
  return matches;
}

// ─── ROUTES ────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, dob, rollNumber, department } = req.body;
    if (!name || !email || !dob) 
      return res.json({ success: false, message: 'All fields required' });
    const exists = await User.findOne({ email });
    if (exists) 
      return res.json({ success: false, message: 'Email already registered' });
    const user = new User({ name, email, dob, rollNumber, department });
    await user.save();
    res.json({ 
      success: true, 
      message: 'Registered! Your password is your date of birth.' 
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) 
      return res.json({ success: false, message: 'Email not registered' });
    if (user.dob !== password) 
      return res.json({ success: false, message: 'Wrong password — use your Date of Birth' });
    req.session.user = { id: user.id, name: user.name, email: user.email };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/me', (req, res) => {
  if (req.session.user) 
    res.json({ loggedIn: true, user: req.session.user });
  else 
    res.json({ loggedIn: false });
});

// Upload item
app.post('/api/items', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const { title, category, type, description, location, date } = req.body;
    if (!title || !category || !type) 
      return res.json({ success: false, message: 'Required fields missing' });
    const item = new Item({
      userId: req.session.user.id,
      uploaderName: req.session.user.name,
      uploaderEmail: req.session.user.email,
      title, category, type, description, location,
      date: date || new Date().toISOString().split('T')[0],
      image: req.file ? `/uploads/${req.file.filename}` : null
    });
    await item.save();
    const matches = await checkForMatches(item);
    res.json({
      success: true,
      item,
      matchCount: matches.length,
      message: matches.length > 0
        ? `Item posted! ${matches.length} match found! Email sent!`
        : 'Item posted successfully!'
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Get all items
app.get('/api/items', async (req, res) => {
  try {
    const { category, type, search } = req.query;
    let query = { status: 'active' };
    if (category && category !== 'all') query.category = category;
    if (type && type !== 'all') query.type = type;
    if (search) query.title = { $regex: search, $options: 'i' };
    const items = await Item.find(query).sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Resolve item
app.patch('/api/items/:id/resolve', requireAuth, async (req, res) => {
  try {
    const item = await Item.findOne({ id: req.params.id });
    if (!item) 
      return res.json({ success: false, message: 'Item not found' });
    if (item.userId !== req.session.user.id) 
      return res.json({ success: false, message: 'Unauthorized' });
    item.status = 'resolved';
    await item.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Get matches for item
app.get('/api/items/:id/matches', requireAuth, async (req, res) => {
  try {
    const item = await Item.findOne({ id: req.params.id });
    if (!item) 
      return res.json({ success: false, message: 'Item not found' });
    const oppositeType = item.type === 'found' ? 'lost' : 'found';
    const matches = await Item.find({
      type: oppositeType,
      category: item.category,
      status: 'active'
    });
    res.json({ success: true, matches });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ─── Pages ─────────────────────────────────────
app.get('/', (req, res) => 
  res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', requireAuth, (req, res) => 
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/upload', requireAuth, (req, res) => 
  res.sendFile(path.join(__dirname, 'public', 'upload.html')));

// ─── Start Server ──────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎒 Lost & Found running on PORT ${PORT}\n`);
});