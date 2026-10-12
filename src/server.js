require('./config/env');
const http = require('http');
const app = require('./app');
const { init } = require('./socket');
const server = http.createServer(app);
init(server);
const port = process.env.PORT || 5000;
server.listen(port, () => console.log(`NeonFlow running on http://localhost:${port}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
