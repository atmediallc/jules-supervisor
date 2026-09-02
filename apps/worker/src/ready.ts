import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { getConfig } from '@jules/config';
import { getDatabase } from '@jules/db';
import { Redis } from 'ioredis';

const PORT = process.env.READY_PORT || 8081;

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/ready' && req.method === 'GET') {
    try {
      const config = getConfig();
      const db = getDatabase(config.DATABASE_URL);
      await db.execute('SELECT 1');
      const redis = new Redis(config.REDIS_URL);
      redis.on("error", () => {
        /* ping below will reject and produce the 503 */
      });
      await redis.ping();
      await redis.quit();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: true }));
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: false }));
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

export function startReadyServer() {
  server.listen(PORT, () => {
    console.log(`Ready server listening on port ${PORT}`);
  });
}

export function stopReadyServer() {
  server.close();
}