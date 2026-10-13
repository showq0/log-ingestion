CREATE TABLE "log_minute_aggregates" (
	"minute" timestamp NOT NULL,
	"service" text NOT NULL,
	"level" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "log_minute_aggregates_minute_service_level_pk" PRIMARY KEY("minute", "service", "level")
);

INSERT INTO "log_minute_aggregates" ("minute", "service", "level", "count")
SELECT date_trunc('minute', "timestamp"), "service", "level", count(*)::integer
FROM "logs"
GROUP BY date_trunc('minute', "timestamp"), "service", "level";
