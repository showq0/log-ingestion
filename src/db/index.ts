// import { drizzle } from "drizzle-orm/postgres-js";
// import postgres from "postgres";

// import * as schema from "./schema.js";
// import { config } from "../config.js";

// export const conn = postgres(config.db.url);
// export const db = drizzle(conn, { schema });


import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";
import { config } from "../config.js";


export const ingestClient = postgres(config.db.url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { statement_timeout: 30000 },
});
const builderClient = postgres(config.db.url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { statement_timeout: 30000 },
});
const aggregationClient = postgres(config.db.url, { max: 5 });
const queryClient = postgres(config.db.url, { max: 5 });

export const builderDb = drizzle(builderClient, { schema });
export const aggregationDb = drizzle(aggregationClient, { schema });
export const queryDb = drizzle(queryClient, { schema });
