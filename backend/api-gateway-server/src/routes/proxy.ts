/**
 * API GATEWAY — Proxy Routes
 *
 * Reverse-proxy all /api/* paths to the appropriate backend microservice.
 * Each route applies JWT auth + rate limiting (configured in server.ts).
 *
 * /api/auth        → auth-server    (:3001)
 * /api/documents   → document-server (:3002)
 * /api/ai          → ai-server       (:3003)
 * /api/quiz        → core-server     (:3004)
 * /api/groups      → core-server     (:3004)
 * /api/dashboard   → core-server     (:3004)
 * /api/notifications → core-server   (:3004)
 * /api/channels    → core-server     (:3004)
 * /channel-uploads → core-server     (:3004) (static files)
 * /api/logs        → log-server      (:3005)
 */

import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../config';
import { proxyOptions } from '../utils/proxy/proxyOptions';

const router = Router();

// -------- Auth routes → auth-server (:3001) --------
router.use('/api/auth', createProxyMiddleware(proxyOptions(config.services.authServer)));

// -------- Document routes → document-server (:3002) --------
router.use('/api/documents', createProxyMiddleware(proxyOptions(config.services.documentServer)));

// -------- AI routes → ai-server (:3003) --------
router.use('/api/ai', createProxyMiddleware(proxyOptions(config.services.aiServer)));

// -------- Quiz routes → core-server (:3004) --------
router.use('/api/quiz', createProxyMiddleware(proxyOptions(config.services.coreServer)));

// -------- Group routes → core-server (:3004) --------
router.use('/api/groups', createProxyMiddleware(proxyOptions(config.services.coreServer)));

// -------- Dashboard routes → core-server (:3004) --------
router.use('/api/dashboard', createProxyMiddleware(proxyOptions(config.services.coreServer)));

// -------- Notification routes → core-server (:3004) --------
router.use('/api/notifications', createProxyMiddleware(proxyOptions(config.services.coreServer)));

// -------- Channel routes → core-server (:3004) --------
router.use('/api/channels', createProxyMiddleware(proxyOptions(config.services.coreServer)));

// -------- Channel uploads (static) → core-server (:3004) --------
router.use('/channel-uploads', createProxyMiddleware(proxyOptions(config.services.coreServer)));

// -------- Log routes → log-server (:3005) --------
router.use('/api/logs', createProxyMiddleware(proxyOptions(config.services.logServer)));

// -------- Admin routes → admin-server (:3006) --------
router.use('/api/admin', createProxyMiddleware(proxyOptions(config.services.adminServer)));

export default router;
