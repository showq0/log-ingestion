import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NewLog } from "../schema.js";
import { minuteAggregates } from "../schema.js";
import { sql } from "drizzle-orm";
import { builderDb, ingestClient } from "../index.js"

// CSV quoting keeps arbitrary messages and JSON attributes safe for COPY.
function csv(value: string | null): string {
    if (value === null) return "";
    return `"${value.replaceAll('"', '""')}"`;
}

/** Persist raw logs and their minute aggregates atomically with PostgreSQL COPY. */
// COPY is a PostgreSQL command designed for bulk data transfer.

export async function writeLogsBatch(entries: NewLog[]): Promise<void> {
    if (entries.length === 0) return;
    //  tx is the database transaction atomic 
    await ingestClient.begin(async (tx) => {
        // copy: destination stream that receives your log data and sends it to PostgreSQL's COPY operation.
        const writeStream = await tx`COPY logs (timestamp, level, service, message, attributes) FROM STDIN WITH (FORMAT CSV, NULL '')`.writable();
        // entries: an array of log objects. rows: one CSV-formatted string representing a database row.
        const rows = entries.map((entry) => [
            csv(entry.timestamp!.toISOString()),
            csv(entry.level),
            csv(entry.service),
            csv(entry.message),
            csv(entry.attributes == null ? null : JSON.stringify(entry.attributes)),
        ].join(",") + "\n");
        // row to copy to the db
        console.log(rows)
        /// Send all the log records in rows to PostgreSQL through the copy writable stream.
        // Readable.from(rows): Read stream.
        // Pipeline: connects streams to transfers data.
        const ReadStream = Readable.from(rows)
        await pipeline(ReadStream, writeStream);
        void aggregationBuilder(entries);
        // calculate aggrigation each time i ingest a bulk 
    });
}
export async function aggregationBuilder(entries: NewLog[]) {
    const counts = new Map<string, { minute: Date; service: string; level: string; count: number }>();
    for (const entry of entries) {
        const minuteMs = Math.floor(entry.timestamp!.getTime() / 60_000) * 60_000;
        const key = `${minuteMs}\u0000${entry.service}\u0000${entry.level}`;
        const aggregate = counts.get(key);
        if (aggregate) aggregate.count++;
        else counts.set(key, { minute: new Date(minuteMs), service: entry.service, level: entry.level, count: 1 });
    }
    const aggregateValues = [...counts.values()].map(
        ({ minute, service, level, count }) => ({
            minute,
            service,
            level,
            count,
        })
    );
    // - target identifies the columns that PostgreSQL uses to detect a conflict.
    // - set defines how to update the existing row when that conflict occurs
    await builderDb.insert(minuteAggregates)
        .values(aggregateValues)
        .onConflictDoUpdate({
            target: [
                minuteAggregates.minute,
                minuteAggregates.service,
                minuteAggregates.level,
            ],
            set: {
                count: sql`${minuteAggregates.count} + excluded.count`,
            },
        });
}
