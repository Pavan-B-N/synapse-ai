import { Router, Request, Response } from 'express';
import axios from 'axios';
import config from '../config';

const router = Router();

interface ServiceHealth {
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy';
  latency?: number;
  details?: any;
}

/**
 * GET /gateway/health-aggregate — Aggregate health from all downstream services
 *
 * @response 200 { success, gateway: { status, uptime }, services: ServiceHealth[] }
 * @response 207 Partial success — some services unhealthy
 */
router.get('/health-aggregate', async (_req: Request, res: Response) => {
  const services = [
    { name: 'auth-server', url: config.services.authServer },
    { name: 'document-server', url: config.services.documentServer },
    { name: 'ai-server', url: config.services.aiServer },
    { name: 'core-server', url: config.services.coreServer },
    { name: 'log-server', url: config.services.logServer },
    { name: 'admin-server', url: config.services.adminServer },
  ];

  const results: ServiceHealth[] = await Promise.all(
    services.map(async (svc): Promise<ServiceHealth> => {
      const start = Date.now();
      try {
        const { data } = await axios.get(`${svc.url}/health`, { timeout: 5000 });
        return { name: svc.name, url: svc.url, status: 'healthy', latency: Date.now() - start, details: data };
      } catch {
        return { name: svc.name, url: svc.url, status: 'unhealthy', latency: Date.now() - start };
      }
    })
  );

  const allHealthy = results.every(r => r.status === 'healthy');
  res.status(allHealthy ? 200 : 207).json({
    success: true,
    gateway: { status: 'healthy', uptime: process.uptime() },
    services: results,
  });
});

export default router;
