import { register, collectDefaultMetrics } from 'prom-client';
import { metrics } from '@jules/observability';

collectDefaultMetrics();

export async function getMetrics() {
  const base = await register.metrics();
  // Merge @jules/observability custom metrics (decisions, corrections, failovers, etc.)
  // into the Prometheus exposition so the /metrics endpoint reflects live worker activity.
  const custom = metrics.toPrometheusFormat();
  return `${base}\n${custom}`;
}

export { register };