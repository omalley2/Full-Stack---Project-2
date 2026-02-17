const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// PostgreSQL connection pool
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bank_lending_db',
    });

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL database:', err);
  } else {
    console.log('✅ Connected to PostgreSQL database');
  }
});

module.exports = pool;
