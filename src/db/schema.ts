import {
    uuid,
    jsonb,
    pgTable,
    text,
    timestamp,
    primaryKey,
    index,
    integer,
} from "drizzle-orm/pg-core";

// PostgreSQL range partitioning is declared in the SQL migration because
// Drizzle's pgTable schema currently describes columns and indexes only.
export const logs = pgTable("logs", {
    id: uuid("id").notNull().defaultRandom(),

    timestamp: timestamp("timestamp").notNull().defaultNow(),

    level: text("level").notNull(),

    service: text("service").notNull(),

    message: text("message").notNull(),

    attributes: jsonb("attributes"),
}, (table) => [
    primaryKey({ columns: [table.timestamp, table.id] }),

    index("logs_service_timestamp_idx").on(
        table.service,
        table.level,
        table.timestamp.desc(),
        table.id.desc()
    ),
]);

export const minuteAggregates = pgTable("log_minute_aggregates", {
    minute: timestamp("minute").notNull(),
    service: text("service").notNull(),
    level: text("level").notNull(),
    count: integer("count").notNull(),
}, (table) => [
    primaryKey({ columns: [table.minute, table.service, table.level] }),
]);

export type NewLog = typeof logs.$inferInsert;
