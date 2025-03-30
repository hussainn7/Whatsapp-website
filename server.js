const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const qrcode = require('qrcode');
const { WhatsAppBot } = require('./whatsapp_bot');
require('dotenv').config();

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Global variables
let latestQrCode = null;
let isAuthenticated = false;
// Store recent logs for new connections
const recentLogs = [];
const MAX_RECENT_LOGS = 100;

// Function to add a log entry to the recent logs array
function addRecentLog(message, type) {
  recentLogs.push({ message, type });
  if (recentLogs.length > MAX_RECENT_LOGS) {
    recentLogs.shift(); // Remove oldest log
  }
}

// Function to emit console logs to connected clients
function emitConsoleLog(message, type) {
  // Add to recent logs
  addRecentLog(message, type);
  // Emit to all connected clients
  io.emit('console', { message, type });
}

// Setup console log capture
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Override console methods to capture logs
console.log = function() {
  originalConsoleLog.apply(console, arguments);
  emitConsoleLog(Array.from(arguments).join(' '), 'info');
};

console.error = function() {
  originalConsoleError.apply(console, arguments);
  emitConsoleLog(Array.from(arguments).join(' '), 'error');
};

console.warn = function() {
  originalConsoleWarn.apply(console, arguments);
  emitConsoleLog(Array.from(arguments).join(' '), 'warning');
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'whatsapp-bot-admin-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.static(path.join(__dirname, 'public')));

// Admin credentials (in a real app, these would be stored securely)
const adminCredentials = {
  username: 'admin',
  password: 'admin' // Plain text password for simplicity
};

// Initialize WhatsApp bot
const bot = new WhatsAppBot(io);

// Authentication middleware
const authenticateUser = (req, res, next) => {
  if (req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
};

// Routes
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Simple direct comparison for development/demo purposes
  if (username === adminCredentials.username && password === adminCredentials.password) {
    req.session.authenticated = true;
    res.redirect('/dashboard');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/dashboard', authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/settings', authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// API endpoints
app.get('/api/settings', authenticateUser, (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.post('/api/settings', authenticateUser, (req, res) => {
  try {
    const settings = req.body;
    fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
    
    // Emit settings update event
    global.eventEmitter.emit('settingsUpdated', settings);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Send the latest QR code if available
  if (latestQrCode) {
    socket.emit('qrCode', latestQrCode);
  }
  
  // Send recent logs to new connections
  recentLogs.forEach(log => {
    socket.emit('console', log);
  });
  
  // Handle session update requests from the admin panel
  socket.on('updateWhatsAppSession', (data) => {
    try {
      if (data && data.session) {
        console.log('Received manual session update from admin panel');
        
        // Update settings with the new session data
        const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
        settings.whatsappSession = data.session;
        fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
        
        // Emit settings update event
        global.eventEmitter.emit('settingsUpdated', settings);
        
        socket.emit('sessionUpdated', { 
          success: true, 
          message: 'WhatsApp session updated successfully' 
        });
      }
    } catch (error) {
      console.error('Error updating WhatsApp session:', error);
      socket.emit('sessionUpdated', { 
        success: false, 
        message: 'Failed to update WhatsApp session: ' + error.message 
      });
    }
  });
  
  // Handle request for current session data
  socket.on('getWhatsAppSession', () => {
    try {
      const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
      socket.emit('whatsAppSession', { 
        session: settings.whatsappSession || '',
        isValid: bot.isAuthenticated || false
      });
    } catch (error) {
      console.error('Error getting WhatsApp session:', error);
      socket.emit('whatsAppSession', { 
        session: '',
        isValid: false,
        error: error.message
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}`);
  
  // Start WhatsApp bot
  bot.start();
}); 
