// Schedule retention cleanup every 24 hours.

// retention() {
//     // Delete raw logs older than 7 days.
//     delete logs where timestamp < now - 7 days;

//     // Preserve historical statistics for 90 days.
//     delete minuteAggregates where minute < now - 90 days;
// }

import { lt } from "drizzle-orm";
import { maintenanceDb } from "./db/index.js";
import { logs, minuteAggregates } from "./db/schema.js";

export const LOG_RETENTION_DAYS = 7;
export const AGGREGATION_RETENTION_DAYS = 90;

export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000 //1 day

let retentionTimer: ReturnType<typeof setInterval> | undefined;

export async function retention(
): Promise<void> {
    const now = Date.now();

    const logsCutoff = new Date(
        now - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const aggregatesCutoff = new Date(
        now - AGGREGATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    await maintenanceDb
        .delete(logs)
        .where(lt(logs.timestamp, logsCutoff));

    await maintenanceDb
        .delete(minuteAggregates)
        .where(lt(minuteAggregates.minute, aggregatesCutoff));
}

/**
 * Schedules the retention cleanup task to run periodically
 */
export function scheduleRetention(intervalMs: number = RETENTION_INTERVAL_MS): ReturnType<typeof setInterval> {

    if (retentionTimer) {
        clearInterval(retentionTimer);
    }

    retentionTimer = setInterval(async () => {
        try {
            await retention();
        } catch (error) {
            console.error("Failed to run scheduled log retention:", error);
        }
    }, intervalMs);

    return retentionTimer;
}


