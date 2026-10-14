import type { NewLog } from "../schema.js";
import { writeLogsBatch } from "./copyWriter.js";

type PendingWrite = {
    logs: NewLog[];
    resolve: (count: number) => void;
    reject: (error: unknown) => void;
};

const COPY_BATCH_SIZE = 1000;
const COPY_BATCH_DELAY_MS = 5;
let pendingWrites: PendingWrite[] = [];
let pendingCount = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushInProgress: Promise<void> | undefined;

function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(() => void flushWrites(), COPY_BATCH_DELAY_MS);
}

async function flushWrites(): Promise<void> {
    if (flushInProgress) return flushInProgress;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    if (pendingWrites.length === 0) return;

    const batch = pendingWrites;
    pendingWrites = [];
    pendingCount = 0;
    flushInProgress = writeLogsBatch(batch.flatMap((write) => write.logs))
        .then(() => batch.forEach((write) => write.resolve(write.logs.length)))
        .catch((error: unknown) => batch.forEach((write) => write.reject(error)))
        .finally(() => {
            flushInProgress = undefined;
            if (pendingWrites.length) scheduleFlush();
        });
    return flushInProgress;
}

/** Queue a request's logs and resolve once their batched transaction commits. */
export function enqueueLogs(entries: NewLog[]): Promise<number> {
    if (entries.length === 0) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
        pendingWrites.push({ logs: entries, resolve, reject });
        pendingCount += entries.length;
        if (pendingCount >= COPY_BATCH_SIZE) void flushWrites();
        else scheduleFlush();
    });
}
