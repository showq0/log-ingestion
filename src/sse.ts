import { Request, Response } from "express";
import type { NewLog } from "./db/schema.js";

const clients = new Set<Response>();

export function sseLogsHandler(req: Request, res: Response) {
    // Set headers required for Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(": connected\n\n");
    // it should add id for the client 
    clients.add(res);

    // revent idle connections from being closed.
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(": heartbeat\n\n");
        } catch {
            clearInterval(heartbeatInterval);
            clients.delete(res);
        }
    }, 20000);

    req.on("close", () => {
        clearInterval(heartbeatInterval);
        clients.delete(res);// stop heartbeat messages
    });
}

export function broadcastLogs(logs: NewLog[] | NewLog) {
    if (clients.size === 0) return;

    const list = Array.isArray(logs) ? logs : [logs];
    if (list.length === 0) return;

    const payload = `data: ${JSON.stringify(logs)}\n\n`;
    // client res sends the logs 
    for (const client of clients) {
        try {
            client.write(payload);
        } catch {
            clients.delete(client);
        }
    }
}

export function getConnectedSSEClientCount(): number {
    return clients.size;
}
