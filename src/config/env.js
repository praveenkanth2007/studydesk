require('dotenv').config();
const missing = ['DATABASE_URL', 'JWT_SECRET'].filter(k => !process.env[k]);
if (missing.length) { console.error(`Missing required environment variables: ${missing.join(', ')}.\nCopy .env.example to .env and fill them in.`); process.exit(1); }
if (process.env.JWT_SECRET.length < 32) { console.error('JWT_SECRET must be at least 32 characters.'); process.exit(1); }
