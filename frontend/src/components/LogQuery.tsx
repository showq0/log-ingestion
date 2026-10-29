
import { useState, type FormEvent } from "react";

type LogEntry = {
    id: string;
    timestamp: string;
    service: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    attributes: Record<string, unknown> | null;
};

type LogsResponse = {
    result?: {
        logs?: LogEntry[];
        next_cursor?: string | null;
    };
    logs?: LogEntry[];
    next_cursor?: string | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function toISOStringOrUndefined(value: string): string | undefined {
    if (!value) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid date or time.");
    }

    return date.toISOString();
}

function LogQuery() {
    const [service, setService] = useState("");
    const [level, setLevel] = useState("");
    const [attributeKey, setAttributeKey] = useState("");
    const [attributeValue, setAttributeValue] = useState("");
    const [searchText, setSearchText] = useState("");

    const [since, setSince] = useState("");
    const [until, setUntil] = useState("");
    const [limit, setLimit] = useState("100");

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    async function fetchLogs(cursor?: string | null) {
        setLoading(true);
        setError(null);
        setHasSearched(true);

        try {
            const params = new URLSearchParams();

            if (service) params.set("service", service);
            if (level) params.set("level", level);

            if (attributeKey.trim() && attributeValue.trim()) {
                params.set(
                    `attr.${attributeKey.trim()}`,
                    attributeValue.trim()
                );
            }

            if (searchText.trim()) {
                params.set("q", searchText.trim());
            }

            const sinceISO = toISOStringOrUndefined(since);
            const untilISO = toISOStringOrUndefined(until);

            if (sinceISO) params.set("since", sinceISO);
            if (untilISO) params.set("until", untilISO);

            params.set("limit", limit);

            if (cursor) {
                params.set("cursor", cursor);
            }

            const response = await fetch(
                `${API_BASE_URL}/logs?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error(`Request failed: HTTP ${response.status}`);
            }

            const data: LogsResponse = await response.json();
            const fetchedLogs = data.result?.logs ?? data.logs;
            const returnedCursor =
                data.result?.next_cursor ?? data.next_cursor ?? null;

            if (!Array.isArray(fetchedLogs)) {
                throw new Error("Unexpected API response format.");
            }

            setLogs(fetchedLogs);
            setNextCursor(returnedCursor);
        } catch (err) {
            setLogs([]);
            setNextCursor(null);
            setError(
                err instanceof Error ? err.message : "Failed to query logs."
            );
        } finally {
            setLoading(false);
        }
    }

    function handleQuery(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        // A new search must start from the first page.
        void fetchLogs(null);
    }

    return (
        <section className="panel" id="log-query">
            <div className="panel-header">
                <div>
                    <h2>Query Logs</h2>
                    <p>Search and filter your logs.</p>
                </div>

                <button
                    className="primary-button"
                    type="submit"
                    form="log-query-form"
                    disabled={loading}
                >
                    {loading ? "Searching..." : "Run Query"}
                </button>
            </div>

            <form
                id="log-query-form"
                className="filter-grid"
                onSubmit={handleQuery}
            >
                <label>
                    Service
                    <select
                        value={service}
                        onChange={(event) => setService(event.target.value)}
                    >
                        <option value="">All services</option>
                        <option value="api">api</option>
                        <option value="checkout">checkout</option>
                        <option value="payments">payments</option>
                        <option value="orders">orders</option>
                        <option value="users">users</option>
                    </select>
                </label>

                <label>
                    Level
                    <select
                        value={level}
                        onChange={(event) => setLevel(event.target.value)}
                    >
                        <option value="">All levels</option>
                        <option value="debug">debug</option>
                        <option value="info">info</option>
                        <option value="warn">warn</option>
                        <option value="error">error</option>
                    </select>
                </label>

                <label>
                    Attribute key
                    <input
                        value={attributeKey}
                        onChange={(event) => setAttributeKey(event.target.value)}
                        placeholder="e.g. region"
                    />
                </label>

                <label>
                    Attribute value
                    <input
                        value={attributeValue}
                        onChange={(event) => setAttributeValue(event.target.value)}
                        placeholder="e.g. eu-west"
                    />
                </label>

                <label>
                    Search text (q)
                    <input
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder="e.g. payment declined"
                    />
                </label>

                <label>
                    Since
                    <input
                        type="datetime-local"
                        value={since}
                        onChange={(event) => setSince(event.target.value)}
                    />
                </label>

                <label>
                    Until
                    <input
                        type="datetime-local"
                        value={until}
                        onChange={(event) => setUntil(event.target.value)}
                    />
                </label>

                <label>
                    Results per page
                    <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={limit}
                        onChange={(event) => setLimit(event.target.value)}
                        required
                    />
                </label>
            </form>

            {error && (
                <div className="api-error" role="alert">
                    Unable to query logs: {error}
                </div>
            )}

            {loading && (
                <div className="empty-state">Loading query results...</div>
            )}

            {hasSearched && !loading && !error && (
                <p>
                    Returned {logs.length} log{logs.length === 1 ? "" : "s"}.
                </p>
            )}

            {hasSearched && !loading && !error && logs.length === 0 && (
                <div className="empty-state">No matching logs found.</div>
            )}

            {logs.length > 0 && (
                <>
                    <div className="logs-table-wrapper">
                        <table className="logs-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Service</th>
                                    <th>Level</th>
                                    <th>Message</th>
                                    <th>Attributes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="timestamp-cell">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td>
                                            <span className="service-name">
                                                {log.service}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`log-level level-${log.level}`}>
                                                <span className="level-indicator" />
                                                {log.level}
                                            </span>
                                        </td>
                                        <td className="message-cell">
                                            {log.message}
                                        </td>
                                        <td>
                                            <code className="attributes-cell">
                                                {JSON.stringify(log.attributes ?? {})}
                                            </code>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="pagination-controls">
                        <button
                            className="primary-button"
                            type="button"
                            disabled={loading || !nextCursor}
                            onClick={() => void fetchLogs(nextCursor)}
                        >
                            Next page
                        </button>
                    </div>
                </>
            )}
        </section>
    );
}

export default LogQuery;
