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
export async function writeLogsBatch(entries: NewLog[]): Promise<void> {
    if (entries.length === 0) return;

    await conn.begin(async (tx) => {
        const copy = await tx`COPY logs (timestamp, level, service, message, attributes) FROM STDIN WITH (FORMAT CSV, NULL '')`.writable();
        const rows = entries.map((entry) => [
            csv(entry.timestamp!.toISOString()),
            csv(entry.level),
            csv(entry.service),
            csv(entry.message),
            csv(entry.attributes == null ? null : JSON.stringify(entry.attributes)),
        ].join(",") + "\n");
        await pipeline(Readable.from(rows), copy);

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
        await tx.unsafe(`INSERT INTO log_minute_aggregates (minute, service, level, count)
            VALUES ${placeholders}
            ON CONFLICT (minute, service, level) DO UPDATE
            SET count = log_minute_aggregates.count + EXCLUDED.count`, values);
    });
}
