const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Item = require('../models/Item');

// Setup image storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// POST - Add a new lost/found item
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, description, category, location } = req.body;
    const image = req.file ? req.file.filename : '';
    const item = new Item({ title, description, category, location, image });
    await item.save();
    res.json({ message: '✅ Item posted successfully!', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Get all items
router.get('/', async (req, res) => {
  try {
    const items = await Item.find().sort({ date: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;