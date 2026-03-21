import { Options } from 'http-proxy-middleware';
import config from '../../config';
import logger from '../../Logger';

export function proxyOptions(target: string, pathRewrite?: Record<string, string>): Options {
    return {
        target,
        changeOrigin: true,
        pathRewrite,
        on: {
            proxyReq: (proxyReq, req: any) => {
                // Restore full path (Express strips the router prefix)
                proxyReq.path = req.originalUrl;
                // Inject S2S secret for downstream service authentication
                proxyReq.setHeader('x-internal-key', config.s2sToken.secret);
                // Forward RAID for distributed tracing
                if (req.headers['x-raid']) proxyReq.setHeader('x-raid', req.headers['x-raid']);
                // Forward request ID
                if (req.headers['x-request-id']) proxyReq.setHeader('x-request-id', req.headers['x-request-id']);
                // Forward user context injected by JWT middleware
                if (req.headers['x-user-id']) proxyReq.setHeader('x-user-id', req.headers['x-user-id']);
                if (req.headers['x-user-email']) proxyReq.setHeader('x-user-email', req.headers['x-user-email']);
                if (req.headers['x-user-name']) proxyReq.setHeader('x-user-name', req.headers['x-user-name']);
                if (req.headers['x-user-role']) proxyReq.setHeader('x-user-role', req.headers['x-user-role']);
                logger.info('Proxy: forwarding request', { raid: req.headers['x-raid'], userId: req.headers['x-user-id'], meta: { target, path: req.originalUrl, method: req.method } });
            },
            proxyRes: (proxyRes, req: any, _res) => {
                logger.info('Proxy: response received', { raid: req.headers['x-raid'], userId: req.headers['x-user-id'], meta: { target, path: req.originalUrl, statusCode: proxyRes.statusCode } });
            },
            error: (err, req: any, res: any) => {
                logger.error('Proxy: upstream error', { raid: (req as any).headers?.['x-raid'], meta: { target, path: (req as any).originalUrl, error: (err as any).message } });
                if (!res.headersSent) {
                    res.status(502).json({ success: false, error: 'Service unavailable' });
                }
            },
        },
    };
}
