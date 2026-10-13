import { db } from "../index.js";
import { NewLog, logs, minuteAggregates } from "../schema.js";
import { and, eq, gte, lt, SQL, desc, sql } from "drizzle-orm";
import { encodeCursor } from "../../utils.js";
const PAGE_DEFAULT = 100;

const intervals = {
    "1m": sql`interval '1 minute'`,
    "5m": sql`interval '5 minutes'`,
    "1h": sql`interval '1 hour'`,
    "1d": sql`interval '1 day'`,
} as const;
const minuteMs = 60_000;
const widths: Record<Bucket, number> = {
    "1m": minuteMs,
    "5m": 5 * minuteMs,
    "1h": 60 * minuteMs,
    "1d": 24 * 60 * minuteMs,
};
export type Bucket = keyof typeof intervals;


export async function createLogs(logEntries: NewLog[]) {
    // atomic unit Insert logs and update aggregates.
    // tx transaction object.
    return db.transaction(async (tx) => {
        // Insert the raw logs.
        const inserted = await tx
            .insert(logs)
            .values(logEntries)
            .onConflictDoNothing()
            .returning();

        if (inserted.length === 0) return inserted;

        // Calculate the counts for those newly inserted logs.
        const counts = new Map<string, { minute: Date; service: string; level: string; count: number }>();
        for (const row of inserted) {
            const minuteMs = Math.floor(row.timestamp.getTime() / 60_000) * 60_000;
            const minute = new Date(minuteMs);
            const key = `${minuteMs}\u0000${row.service}\u0000${row.level}`;
            const entry = counts.get(key);
            if (entry) entry.count++;
            else counts.set(key, { minute, service: row.service, level: row.level, count: 1 });
        }
        // Update the aggregate table.
        await tx
            .insert(minuteAggregates)
            .values([...counts.values()])
            .onConflictDoUpdate({
                target: [minuteAggregates.minute, minuteAggregates.service, minuteAggregates.level],
                set: { count: sql`${minuteAggregates.count} + excluded.count` },//  updated-count = existing_count + newly_inserted_count;
            });

        return inserted;
    });
}

export async function filterLogs(conditions: SQL[], limit?: number) {
    //where limit (undefined)returns 100 
    const query_limit = limit ?? PAGE_DEFAULT

    const result = await db
        .select()
        .from(logs)
        .where(
            conditions.length > 0
                ? and(...conditions)
                : undefined,
        )
        .orderBy(
            desc(logs.timestamp),
        ).limit(query_limit + 1);

    const hasNextPage = result.length > query_limit;
    // remove extra row
    const logsResult = result.slice(0, query_limit);

    // create next curser by using the last id element 
    // the info should encoded
    const nextCursor = hasNextPage
        ? encodeCursor({
            timestamp: logsResult[logsResult.length - 1].timestamp.toISOString(),
            id: logsResult[logsResult.length - 1].id
        })
        : null;


    return {
        logs: logsResult,
        next_cursor: nextCursor,
    };
}
// from basic table
async function aggregateRaw(conditions: SQL[], groupBy: "service" | "level" | undefined, bucket: Bucket) {
    const bucketExpression = sql<Date>`
        date_bin(
            ${intervals[bucket]},
            ${logs.timestamp},
            timestamptz '1970-01-01'
        )
    `;
    if (groupBy === "service") {
        return db
            .select({
                start: bucketExpression,
                group: logs.service,
                count: sql<number>`count(*)::int`
            }).from(logs).where(
                conditions.length > 0
                    ? and(...conditions)
                    : undefined,).groupBy(
                        bucketExpression,
                        logs.service,
                    );
    }

    if (groupBy === "level") {
        return db
            .select({
                start: bucketExpression,
                group: logs.level,
                count: sql<number>`count(*)::int`,
            }).from(logs).where(
                conditions.length > 0
                    ? and(...conditions)
                    : undefined,
            ).groupBy(
                bucketExpression,
                logs.level,
            );
    }

    return db
        .select({
            start: bucketExpression,
            group: sql<null>`NULL`,
            count: sql<number>`count(*)::int`,
        }).from(logs).where(
            conditions.length > 0
                ? and(...conditions)
                : undefined).groupBy(
                    bucketExpression,
                );
}

export async function aggregateLog(
    conditions: SQL[],
    groupBy: "service" | "level" | undefined,
    bucket: Bucket,
    fastPath?: { since: Date; until: Date; service?: string; level?: string },
) {
    if (!fastPath) return aggregateRaw(conditions, groupBy, bucket);
    // what if the sinceMs or untilMs not complete min

    const minuteMs = 60_000;
    const sinceMs = fastPath.since.getTime();
    const untilMs = fastPath.until.getTime();

    // round smallest number greater that or equal that number 
    const fullStart = Math.ceil(sinceMs / minuteMs) * minuteMs;
    // round greatest number less that or equal that number 
    const fullEnd = Math.floor(untilMs / minuteMs) * minuteMs;
    // If the range contains no complete minutes, preserve exact results with a raw scan.

    if (fullStart >= fullEnd) return aggregateRaw(conditions, groupBy, bucket);

    // row scan condtions  
    const baseFilters: SQL[] = [];
    if (fastPath.service) baseFilters.push(eq(logs.service, fastPath.service));
    if (fastPath.level) baseFilters.push(eq(logs.level, fastPath.level));

    const pieces: { timestamp: Date; group: string | null; count: number }[] = [];


    // roll up condtions 
    const rollupFilters: SQL[] = [
        gte(minuteAggregates.minute, new Date(fullStart)),
        lt(minuteAggregates.minute, new Date(fullEnd)),
    ];

    // group by 
    if (fastPath.service) rollupFilters.push(eq(minuteAggregates.service, fastPath.service));
    if (fastPath.level) rollupFilters.push(eq(minuteAggregates.level, fastPath.level));

    // get data from secondry table 
    const rollups = await db.select({
        minute: minuteAggregates.minute,
        service: minuteAggregates.service,
        level: minuteAggregates.level,
        count: minuteAggregates.count,
    }).from(minuteAggregates).where(and(...rollupFilters));

    //for direct merge below.
    for (const row of rollups) {
        pieces.push({
            timestamp: row.minute,
            group: groupBy === "service" ? row.service : groupBy === "level" ? row.level : null,
            count: row.count,
        });
    }


    const rawRanges: [number, number][] = [];

    // condtion for edge aggrigation 
    if (sinceMs < fullStart) rawRanges.push([sinceMs, Math.min(fullStart, untilMs)]);
    if (fullEnd < untilMs) rawRanges.push([Math.max(fullEnd, sinceMs), untilMs]);

    //Each pair represents a start and end time in milliseconds.
    for (const [start, end] of rawRanges) {
        if (start >= end) continue;
        const edgeConditions = [
            ...baseFilters,
            gte(logs.timestamp, new Date(start)),
            lt(logs.timestamp, new Date(end)),
        ];
        // basic table
        const edgeRows = await aggregateRaw(edgeConditions, groupBy, bucket);
        for (const row of edgeRows) {
            // Raw edge rows are already bucketed; mark them for direct merge below.
            pieces.push({ timestamp: row.start, group: row.group, count: row.count, });
        }
    }
    // Rollup minutes must be regrouped to the requested bucket; edge results already
    // use that bucket, so normalize every timestamp to the same epoch-aligned bucket.

    const width = widths[bucket];
    const merged = new Map<string, { start: Date; group: string | null; count: number }>();
    for (const piece of pieces) {
        const start = new Date(Math.floor(piece.timestamp.getTime() / width) * width);
        const key = `${start.getTime()}\u0000${piece.group ?? ""}`;
        const entry = merged.get(key);
        if (entry) entry.count += piece.count; // add the edge values to the aggrigation 
        else merged.set(key, { start, group: piece.group, count: piece.count });
    }
    return [...merged.values()].map((row) => ({ start: row.start, group: row.group, count: row.count }));
}
