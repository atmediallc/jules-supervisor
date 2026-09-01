import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { getMetrics } from './metrics.js';

const PORT = process.env.HEALTH_PORT || 8080;

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else if (req.url === '/metrics' && req.method === 'GET') {
    try {
      const metrics = await getMetrics();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics);
    } catch {
      res.writeHead(500);
      res.end();
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

export function startHealthServer() {
  server.listen(PORT, () => {
    console.log(`Health & metrics server listening on port ${PORT}`);
  });
}

export function stopHealthServer() {
  server.close();
}