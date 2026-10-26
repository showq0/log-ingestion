import type { NewLog } from "../schema.js";
import { writeLogsBatch } from "./copyWriter.js";

type PendingWrite = {
    logs: NewLog[];
    resolve: (count: number) => void;
    reject: (error: unknown) => void;
};

const COPY_BATCH_SIZE = 1000;
const COPY_BATCH_DELAY_MS = 5;
let pendingLogs: PendingWrite[] = [];
let pendingLogCount = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushInProgress: Promise<void> | undefined;

function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(() => void flushBatch(), COPY_BATCH_DELAY_MS);
}

async function flushBatch(): Promise<void> {
    if (flushInProgress) return flushInProgress;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    if (pendingLogs.length === 0) return;

    const batch = pendingLogs;
    pendingLogs = [];
    pendingLogCount = 0;
    // flat batch, sends them to PostgreSQL for bulk insertion.
    // then: update the resolve for each log in batch:  resolve each request's promise with its log count.
    // catch: update reject for each batch if error: reject each request's promise with the error.
    // disable fushInPorgress index 
    // rschadule Flush if there is new pending logs  

    flushInProgress = writeLogsBatch(batch.flatMap((write) => write.logs))
        .then(() => batch.forEach((writeLogs) => writeLogs.resolve(writeLogs.logs.length)))
        .catch((error: unknown) => batch.forEach((write) => write.reject(error)))
        .finally(() => {
            flushInProgress = undefined;
            if (pendingLogs.length) scheduleFlush();
        }
        );
    return flushInProgress;
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
