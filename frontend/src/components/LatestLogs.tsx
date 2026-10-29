
import { useEffect, useState } from "react";

type LogEntry = {
    id: string;
    timestamp: string;
    service: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    attributes: Record<string, unknown>;
};


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function LatestLogs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        // real-time log ingestion
        const eventSource = new EventSource(`${API_BASE_URL}/logs/stream`);

        eventSource.onopen = () => {
            if (active) {
                setLoading(false);
                setError(null);
            }
        };

        eventSource.onmessage = (event) => {
            if (!active) return;
            try {
                const parsed = JSON.parse(event.data);
                const incoming: LogEntry[] = Array.isArray(parsed)
                    ? parsed
                    : parsed.logs
                        ? parsed.logs
                        : [parsed];

                setLogs((prev) => {
                    const existingIds = new Set(prev.map((log) => log.id));
                    const uniqueNew = incoming.filter((log) => !existingIds.has(log.id));
                    return [...uniqueNew, ...prev].slice(0, 100);
                });
                setLoading(false);
                setError(null);
            } catch (e) {
                console.error("Error parsing SSE log event", e);
            }
        };

        eventSource.onerror = () => {
            if (active) {
                setError("Connection lost. Reconnecting...");
            }
        };

        return () => {
            active = false;
            eventSource.close();
        };
    }, []);

    return (
        <section className="panel" id="latest-logs">
            <div className="panel-header">
                <div>
                    <h2>Latest Ingest Logs</h2>
                    <p>Monitor incoming logs in real time.</p>
                </div>

                <span
                    className={`live-badge ${error ? "connection-error" : ""}`}
                >
                    <span className="status-dot" />
                    {error ? "Connection error" : loading ? "Connecting..." : "Connected"}
                </span>
            </div>

            {error && (
                <div className="api-error" role="alert">
                    Unable to load logs: {error}
                </div>
            )}

            {loading && logs.length === 0 ? (
                <div className="empty-state">Loading logs...</div>
            ) : logs.length === 0 ? (
                <div className="empty-state">Waiting for incoming logs...</div>
            ) : (
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
                                        <span
                                            className={`log-level level-${log.level}`}
                                        >
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
            )}
        </section>
    );
}

export default LatestLogs;
