import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { getMetrics } from './metrics.js';

// M10: bind to a private/container-local interface by default rather than all
// interfaces. Operators who explicitly want LAN exposure set HEALTH_BIND_HOST
// (and must firewall accordingly). The monitoring port carries unauthenticated
// /health and /metrics, so it must never default to 0.0.0.0.
const PORT = Number(process.env.HEALTH_PORT) || 8080;
const HOST = process.env.HEALTH_BIND_HOST || '127.0.0.1';

interface WorkerHealth {
  status: 'ok' | 'degraded';
  lock: 'ok' | 'degraded' | 'disabled';
  redis: 'ok' | 'degraded' | 'disabled';
  queue: 'ok' | 'degraded' | 'disabled';
  db: 'ok' | 'degraded' | 'disabled';
  timestamp: string;
}

let health: WorkerHealth = {
  status: 'ok',
  lock: 'disabled',
  redis: 'disabled',
  queue: 'disabled',
  db: 'ok',
  timestamp: new Date().toISOString(),
};

export function updateHealth(partial: Partial<WorkerHealth>): void {
  health = { ...health, ...partial, timestamp: new Date().toISOString() };
  const degraded =
    health.lock === 'degraded' || health.redis === 'degraded' || health.queue === 'degraded' ||
    health.db === 'degraded';
  health.status = degraded ? 'degraded' : 'ok';
}

export function getHealthSnapshot(): WorkerHealth {
  return { ...health };
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getHealthSnapshot()));
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
  server.listen(PORT, HOST, () => {
    console.log(`Health & metrics server listening on ${HOST}:${PORT}`);
  });
}

export function stopHealthServer() {
  server.close();
}