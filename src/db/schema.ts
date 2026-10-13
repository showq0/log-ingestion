import {
    uuid,
    jsonb,
    pgTable,
    text,
    timestamp,
    primaryKey,
    index,
} from "drizzle-orm/pg-core";

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

export type NewLog = typeof logs.$inferInsert;
