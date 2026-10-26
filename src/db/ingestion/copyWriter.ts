import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { conn } from "../index.js";
import type { NewLog } from "../schema.js";

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
    await conn.begin(async (tx) => {
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

        // calculate aggrigation each time i ingest a bulk 
        const counts = new Map<string, { minute: Date; service: string; level: string; count: number }>();
        for (const entry of entries) {
            const minuteMs = Math.floor(entry.timestamp!.getTime() / 60_000) * 60_000;
            const key = `${minuteMs}\u0000${entry.service}\u0000${entry.level}`;
            const aggregate = counts.get(key);
            if (aggregate) aggregate.count++;
            else counts.set(key, { minute: new Date(minuteMs), service: entry.service, level: entry.level, count: 1 });
        }

        // Use ISO strings with explicit casts for postgres.js unsafe() parameters.
        const values = [...counts.values()].flatMap(({ minute, service, level, count }) => [
            minute.toISOString(), service, level, count,
        ]);
        const placeholders = [...counts.keys()].map((_, index) => {
            const offset = index * 4;
            return `($${offset + 1}::timestamp, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
        }).join(", ");
        // for consistancy in secondery table
        await tx.unsafe(`INSERT INTO log_minute_aggregates (minute, service, level, count)
            VALUES ${placeholders}
            ON CONFLICT (minute, service, level) DO UPDATE
            SET count = log_minute_aggregates.count + EXCLUDED.count`, values);
    });
}
