require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../public')));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch((err) => console.log('❌ Error:', err));

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send email function
async function sendMatchEmail(toEmail, toName, postedItem, matchedItem) {
  try {
    await transporter.sendMail({
      from: `"Lost & Found" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `🎯 Match Found for your lost item: ${postedItem.title}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:16px;">
          <h2 style="color:#f7c948;">🎯 Good News! Your Lost Item May Have Been Found!</h2>
          <p>Hi <strong>${toName}</strong>,</p>
          <p>Someone posted a found item that matches what you lost!</p>
          <div style="background:#13131a;padding:20px;border-radius:12px;margin:20px 0;">
            <p style="color:#6b6b80;font-size:12px;text-transform:uppercase;">Your Lost Item</p>
            <h3 style="color:#ff6b6b;">🔴 ${postedItem.title}</h3>
            <p>📍 ${postedItem.location || '—'} &nbsp; 📅 ${postedItem.date || '—'}</p>
          </div>
          <div style="background:#13131a;padding:20px;border-radius:12px;margin:20px 0;">
            <p style="color:#6b6b80;font-size:12px;text-transform:uppercase;">Matching Found Item</p>
            <h3 style="color:#48c774;">✅ ${matchedItem.title}</h3>
            <p>📍 ${matchedItem.location || '—'} &nbsp; 📅 ${matchedItem.date || '—'}</p>
            <p>👤 Posted by: <strong>${matchedItem.uploaderName || '—'}</strong></p>
            <p>✉️ Contact them at: <strong>${matchedItem.uploaderEmail || '—'}</strong></p>
          </div>
          <p>Please login to the Lost & Found portal and contact the finder!</p>
          <p style="color:#6b6b80;font-size:12px;">This is an automated message from your Campus Lost & Found system.</p>
        </div>
      `
    });
    console.log('✅ Email sent to', toEmail);
  } catch (err) {
    console.log('❌ Email error:', err.message);
  }
}

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  dob: String,
  rollNumber: String,
  department: String
});
const User = mongoose.model('User', userSchema);

const itemSchema = new mongoose.Schema({
  title: String,
  description: String,
  category: String,
  location: String,
  type: String,
  image: String,
  uploaderName: String,
  uploaderEmail: String,
  date: String
}, { timestamps: true });
const Item = mongoose.model('Item', itemSchema);

const sessions = {};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

function getUser(req) {
  const token = req.headers.authorization;
  return token ? sessions[token] : null;
}

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, dob, rollNumber, department } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.json({ success: false, message: 'Email already registered' });
    await new User({ name, email, dob, rollNumber, department }).save();
    res.json({ success: true, message: 'Registered successfully! Please login.' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, dob: password });
    if (!user) return res.json({ success: false, message: 'Invalid email or date of birth' });
    const token = Math.random().toString(36).substring(2) + Date.now();
    sessions[token] = { id: user._id.toString(), name: user.name, email: user.email };
    res.json({ success: true, token, name: user.name });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.get('/api/me', (req, res) => {
  const user = getUser(req);
  if (user) res.json({ loggedIn: true, user });
  else res.json({ loggedIn: false });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization;
  if (token) delete sessions[token];
  res.json({ success: true });
});

app.post('/api/items', upload.single('image'), async (req, res) => {
  try {
    const { title, description, category, location, type, date } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : '';
    const user = getUser(req);

    const newItem = await new Item({
      title, description, category, location, type, date, image,
      uploaderName: user ? user.name : 'Anonymous',
      uploaderEmail: user ? user.email : ''
    }).save();

    // Find matching items
    const oppositeType = type === 'found' ? 'lost' : 'found';
    const matches = await Item.find({
      type: oppositeType,
      category: category,
      _id: { $ne: newItem._id }
    }).limit(5);

    if (type === 'found') {
      // Someone posted a FOUND item
      // Send email to all users who LOST the same category item
      for (const match of matches) {
        if (match.uploaderEmail) {
          await sendMatchEmail(
            match.uploaderEmail,
            match.uploaderName,
            match,
            newItem
          );
        }
      }
    } else if (type === 'lost') {
      // Someone posted a LOST item
      // Send email only to this user if a found match already exists
      if (matches.length > 0 && user && user.email) {
        await sendMatchEmail(
          user.email,
          user.name,
          newItem,
          matches[0]
        );
      }
    }

    res.json({ success: true, message: 'Item posted successfully!', matchCount: matches.length });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.json({ success: true, items: items.map(i => ({
      id: i._id.toString(),
      title: i.title,
      description: i.description,
      category: i.category,
      location: i.location,
      type: i.type,
      image: i.image,
      date: i.date,
      uploaderName: i.uploaderName,
      uploaderEmail: i.uploaderEmail
    }))});
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.get('/api/items/:id/matches', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.json({ matches: [] });
    const matches = await Item.find({
      type: item.type === 'found' ? 'lost' : 'found',
      category: item.category,
      _id: { $ne: item._id }
    }).limit(3);
    res.json({ matches: matches.map(i => ({
      id: i._id.toString(),
      title: i.title,
      category: i.category,
      location: i.location,
      type: i.type,
      image: i.image,
      date: i.date
    }))});
  } catch (err) {
    res.json({ matches: [] });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.json({ notifications: [] });
    const myItems = await Item.find({ uploaderEmail: user.email });
    const notifications = [];
    for (const item of myItems) {
      const matches = await Item.find({
        type: item.type === 'found' ? 'lost' : 'found',
        category: item.category,
        _id: { $ne: item._id }
      }).limit(3);
      if (matches.length > 0) {
        notifications.push({
          itemTitle: item.title,
          itemId: item._id.toString(),
          matches: matches.map(m => ({
            id: m._id.toString(),
            title: m.title,
            category: m.category,
            location: m.location,
            type: m.type,
            date: m.date
          }))
        });
      }
    }
    res.json({ notifications });
  } catch (err) {
    res.json({ notifications: [] });
  }
});

app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, '../public/upload.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.listen(process.env.PORT, () => {
  console.log('🚀 Server running on http://localhost:' + process.env.PORT);
});