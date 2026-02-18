import { Router } from 'express';
import { addClient } from '../services/sse.js';

const router = Router();

// SSE endpoint for real-time mission updates
router.get('/:missionId', (req, res) => {
    const { missionId } = req.params;

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ missionId })}\n\n`);

    // Register this client
    addClient(missionId, res);

    // Keep alive with periodic heartbeats
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
    });
});

export default router;
