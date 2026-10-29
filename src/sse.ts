import { Request, Response } from "express";
import type { NewLog } from "./db/schema.js";

const clients = new Set<Response>();

const SSE_BATCH_INTERVAL_MS = 3; // Flush every 3ms
const MAX_BATCH_TO_FRONTEND = 100; //prevent overwhelming the browser during spikes

let pendingLogs: NewLog[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

export function sseLogsHandler(req: Request, res: Response) {
    // Set headers required for Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(": connected\n\n");
    // it should add id for the client 
    clients.add(res);

    // Prevent idle connections from being closed
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
        clients.delete(res);
    });
}


export function flushSSEBuffer(): void {
    if (pendingLogs.length === 0 || clients.size === 0) {
        pendingLogs = [];
        flushTimer = undefined;
        return;
    }


    // Keep the most recent logs if there's an overwhelming spike
    const batch = pendingLogs.slice(0, MAX_BATCH_TO_FRONTEND);
    pendingLogs = pendingLogs.slice(batch.length);

    const payload = `data: ${JSON.stringify(batch)}\n\n`;

    for (const client of clients) {
        try {
            client.write(payload);
        } catch {
            clients.delete(client);
        }
    }
    if (pendingLogs.length === 0 || clients.size === 0) {
        clearInterval(flushTimer);
        flushTimer = undefined;
    }
}

/**
 * Buffers incoming logs and flushes them to SSE clients in batches every 3ms.
 * This avoids network bandwidth thrashing and prevents client-side rendering bottlenecks.
 */
export function broadcastLogs(logs: NewLog[] | NewLog) {
    if (clients.size === 0) return;

    const list = Array.isArray(logs) ? logs : [logs];
    if (list.length === 0) return;

    pendingLogs.push(...list);

    if (!flushTimer) {
        flushTimer = setInterval(flushSSEBuffer, SSE_BATCH_INTERVAL_MS);
    }
}

export function getConnectedSSEClientCount(): number {
    return clients.size;
}
