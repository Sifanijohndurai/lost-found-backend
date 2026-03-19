# 🎒 College Lost & Found System

A full-featured web app for students to report and find lost items on campus.

## Features
- **Page 1** – Login / Register (password = Date of Birth)
- **Page 2** – Dashboard with category browsing and item listings
- **Page 3** – Upload lost or found items with images and location
- **Automatic email notifications** when a matching item is found
- **Match detection** based on category similarity

---

## 🚀 Setup Instructions (VS Code)

### 1. Install Node.js
Download from https://nodejs.org (LTS version recommended)

### 2. Open this folder in VS Code
```
File → Open Folder → select `lost-found` folder
```

### 3. Open Terminal in VS Code
```
Terminal → New Terminal  (or Ctrl + `)
```

### 4. Install dependencies
```bash
npm install
```

### 5. Configure Email (for notifications)

**Option A: Environment Variables (Recommended)**
```bash
# Windows (Command Prompt)
set EMAIL_USER=yourcollegeemail@gmail.com
set EMAIL_PASS=your-gmail-app-password
node server.js

# Mac/Linux
EMAIL_USER=yourcollegeemail@gmail.com EMAIL_PASS=your-app-password node server.js
```

**Option B: Edit server.js directly**
Open `server.js` and find the `createTransporter()` function:
```js
auth: {
  user: 'your-college-email@gmail.com',  // ← change this
  pass: 'your-app-password'              // ← change this
}
```

**Getting a Gmail App Password:**
1. Go to myaccount.google.com → Security
2. Enable 2-Step Verification
3. Go to App Passwords → Generate one for "Mail"
4. Use that 16-character password

### 6. Start the server
```bash
npm start
# or for auto-restart on changes:
npm run dev
```

### 7. Open the app
Go to http://localhost:3000 in your browser

---

## 📁 Project Structure
```
lost-found/
├── server.js          ← Main backend (Node.js/Express)
├── package.json       ← Dependencies
├── db.json            ← Auto-created database (JSON file)
├── uploads/           ← Uploaded images stored here
└── public/
    ├── index.html     ← Page 1: Login & Register
    ├── dashboard.html ← Page 2: Browse items by category
    └── upload.html    ← Page 3: Report lost/found item
```

---

## 🔐 How Login Works
- Students register with their college email + date of birth
- Their **date of birth IS their password** (in YYYY-MM-DD format)
- Sessions last 24 hours

## 📧 Match & Notification System
- When a new item is uploaded, the system checks all items of the **opposite type** (found vs lost) in the **same category**
- If a match is found, an email is sent to the person who reported the lost item
- All matches are visible in the item detail popup on the dashboard

---

## 🛠️ Tech Stack
- **Backend:** Node.js + Express
- **Database:** JSON file (simple, no setup needed)
- **File Storage:** Local (uploads/ folder)
- **Email:** Nodemailer (Gmail SMTP)
- **Frontend:** Vanilla HTML/CSS/JS
