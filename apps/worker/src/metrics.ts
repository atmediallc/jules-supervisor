import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics();

export async function getMetrics() {
  return register.metrics();
}

export { register };