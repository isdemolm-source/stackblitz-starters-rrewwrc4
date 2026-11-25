const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DB_FILE = path.join(__dirname, 'database.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, messages: [] }, null, 2));
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function(req, file, cb) {
    const uniekeNaam = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, uniekeNaam);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function leesDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function schrijfDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. INLOGGEN & ACCOUNT AANMAKEN
app.post('/api/login', function(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Vul naam, e-mail en wachtwoord in.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const db = leesDB();

  if (db.users[cleanEmail]) {
    if (db.users[cleanEmail].password !== password) {
      return res.status(401).json({ error: 'Verkeerd wachtwoord voor dit account!' });
    }
    db.users[cleanEmail].name = name.trim();
  } else {
    db.users[cleanEmail] = {
      name: name.trim(),
      email: cleanEmail,
      password: password,
      avatar: '',
      location: null
    };
  }

  schrijfDB(db);
  const u = db.users[cleanEmail];
  res.json({ user: { name: u.name, email: u.email, avatar: u.avatar || '' } });
});

// 2. PROFIELFOTO OPSLAAN (DIRECT ALS DATA-URL IN DATABASE)
app.post('/api/avatar', function(req, res) {
  const { email, avatarData } = req.body;
  if (!email || !avatarData) {
    return res.status(400).json({ error: 'Geen foto ontvangen' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const db = leesDB();
  if (!db.users[cleanEmail]) {
    return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  }

  db.users[cleanEmail].avatar = avatarData;
  schrijfDB(db);

  res.json({ avatar: avatarData });
});

// 3. LOCATIE UPDATEN VOOR "WHERE ARE YOUR FRIENDS?"
app.post('/api/location', function(req, res) {
  const { email, lat, lng } = req.body;
  if (!email) return res.status(400).json({ error: 'Geen e-mailadres' });

  const cleanEmail = email.trim().toLowerCase();
  const db = leesDB();
  if (!db.users[cleanEmail]) return res.status(404).json({ error: 'Gebruiker niet gevonden' });

  if (lat === null || lng === null) {
    db.users[cleanEmail].location = null;
  } else {
    db.users[cleanEmail].location = {
      lat: Number(lat),
      lng: Number(lng),
      updatedAt: Date.now()
    };
  }

  schrijfDB(db);
  res.json({ ok: true });
});

// 4. ALLE GEBRUIKERS, LOCATIES & BERICHTEN OPHALEN
app.get('/api/data', function(req, res) {
  const { chatId } = req.query;
  const db = leesDB();

  const users = Object.values(db.users).map(function(u) {
    return {
      name: u.name,
      email: u.email,
      avatar: u.avatar || '',
      location: u.location || null
    };
  });
  const messages = chatId ? db.messages.filter(function(m) { return m.chatId === chatId; }) : [];

  res.json({ users: users, messages: messages });
});

// 5. BERICHT, FOTO OF VIDEO VERSTUREN
app.post('/api/send', upload.single('media'), function(req, res) {
  const { chatId, sender, senderName, text } = req.body;
  if (!chatId || !sender) return res.status(400).json({ error: 'Ontbrekende gegevens' });

  let mediaUrl = '';
  let mediaType = '';

  if (req.file) {
    mediaUrl = '/uploads/' + req.file.filename;
    mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
  }

  const db = leesDB();
  db.messages.push({
    id: Date.now(),
    chatId: chatId,
    sender: sender,
    senderName: senderName,
    text: text || '',
    mediaUrl: mediaUrl,
    mediaType: mediaType,
    time: Date.now()
  });

  schrijfDB(db);
  res.json({ ok: true });
});

app.listen(PORT, function() {
  console.log('PulseChat draait op http://localhost:' + PORT);
});
