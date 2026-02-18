import type { Response } from 'express';

// In-memory map of active SSE connections per mission
const connections = new Map<string, Set<Response>>();

export function addClient(missionId: string, res: Response): void {
    if (!connections.has(missionId)) {
        connections.set(missionId, new Set());
    }
    connections.get(missionId)!.add(res);

    res.on('close', () => {
        connections.get(missionId)?.delete(res);
        if (connections.get(missionId)?.size === 0) {
            connections.delete(missionId);
        }
    });
}

export function broadcast(missionId: string, eventType: string, data: unknown): void {
    const clients = connections.get(missionId);
    if (!clients) return;

    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
        client.write(payload);
    }
}
