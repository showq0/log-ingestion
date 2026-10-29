import type { NewLog } from "../schema.js";
import { writeLogsBatch } from "./copyWriter.js";

type PendingWrite = {
    logs: NewLog[];
    resolve: (count: number) => void;
    reject: (error: unknown) => void;
};

const COPY_BATCH_SIZE = 2000;
const COPY_BATCH_DELAY_MS = 5;
// Start conservatively; tune against database capacity and ingestion latency.
const MAX_ACTIVE_FLUSHES = 6;
let pendingLogs: PendingWrite[] = [];
let pendingLogCount = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let activeFlushes = 0;

function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(() => void flushBatch(), COPY_BATCH_DELAY_MS);
}

async function flushBatch(): Promise<void> {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    while (pendingLogs.length > 0 && activeFlushes < MAX_ACTIVE_FLUSHES) {
        const batch = pendingLogs;
        pendingLogs = [];
        pendingLogCount = 0;
        activeFlushes++;
        // flat batch, sends them to PostgreSQL for bulk insertion.
        // then: update the resolve for each log in batch:  resolve each request's promise with its log count.
        // catch: update reject for each batch if error: reject each request's promise with the error.
        // disable fushInPorgress index 
        // rschadule Flush if there is new pending logs  

        // Each flush owns its batch and a separate pool connection, so batches
        // can run concurrently without sharing mutable queue state.
        void writeLogsBatch(batch.flatMap((write) => write.logs))
            .then(() => batch.forEach((write) => write.resolve(write.logs.length)))
            .catch((error: unknown) => batch.forEach((write) => write.reject(error)))
            .finally(() => {
                activeFlushes--;
                if (pendingLogs.length > 0) void flushBatch();
            });
    }
    if (pendingLogs.length > 0) scheduleFlush();
}

/** Queue a request's logs and resolve once their batched transaction commits. */
export function enqueueLogs(entries: NewLog[]): Promise<number> {
    if (entries.length === 0) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
        pendingLogs.push({ logs: entries, resolve, reject });
        pendingLogCount += entries.length;
        if (pendingLogCount >= COPY_BATCH_SIZE) void flushBatch();
        else scheduleFlush();
    });
}
