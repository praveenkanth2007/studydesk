const path = require('path'), express = require('express'), helmet = require('helmet'), cors = require('cors'), cookieParser = require('cookie-parser');
const routes = require('./routes');
const S = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", 'ws:', 'wss:'],
  frameAncestors: ["'none'"], upgradeInsecureRequests: null } } }));
const allowed = (process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (o, cb) => cb(null, !o || allowed.includes(o)), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', S.apiLimiter, S.sameOrigin, routes, notFound);
app.use('/vendor', express.static(path.join(__dirname, '../node_modules/chart.js/dist'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '../public'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).type('text').send('Page not found.'));
app.use(errorHandler);
module.exports = app;
