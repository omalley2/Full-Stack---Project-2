const express = require('express');
const exphbs = require('express-handlebars');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const bankRoutes = require('./routes/bankRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Handlebars setup
const hbs = exphbs.create({
  helpers: {
    formatDate: (date) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    },
    formatNumber: (num, decimals = 2) => {
      if (num === null || num === undefined) return 'N/A';
      return Number(num).toFixed(decimals);
    },
    formatPercent: (num, decimals = 2) => {
      if (num === null || num === undefined) return 'N/A';
      return Number(num).toFixed(decimals) + '%';
    },
    formatCurrency: (num) => {
      if (num === null || num === undefined) return 'N/A';
      return '$' + Number(num).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    },
    eq: (a, b) => a === b,
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
  }
});

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.locals.apiTelemetry = {
  totalCalls: 0,
  lastApiCallAt: null,
};

app.use('/api', (req, res, next) => {
  app.locals.apiTelemetry.totalCalls += 1;
  app.locals.apiTelemetry.lastApiCallAt = new Date();
  next();
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'bank-lending-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use('/', bankRoutes);
app.use('/api', apiRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Bank Lending Strategy Optimizer`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'bank_lending_db'}`);
  console.log(`${'='.repeat(60)}\n`);
});
