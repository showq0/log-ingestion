import { useState, type FormEvent } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

type AggregationBucket = {
    start: string;
    group: string;
    count: number;
};

type AggregationResponse = {
    buckets: AggregationBucket[];
};

function Aggregations() {
    const [bucket, setBucket] = useState("1m");
    const [groupBy, setGroupBy] = useState("level");
    const [since, setSince] = useState("");
    const [until, setUntil] = useState("");

    const [service, setService] = useState("");
    const [level, setLevel] = useState("");
    const [attributeKey, setAttributeKey] = useState("");
    const [attributeValue, setAttributeValue] = useState("");
    const [searchText, setSearchText] = useState("");

    const [results, setResults] = useState<AggregationBucket[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    async function handleAggregation(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setLoading(true);
        setError(null);
        setResults(null);
        setHasSearched(true);

        try {
            if (since && until && new Date(since) >= new Date(until)) {
                throw new Error("Since must be earlier than Until.");
            }

            const params = new URLSearchParams();

            params.set("bucket", bucket);
            params.set("group_by", groupBy);

            if (since) {
                const date = new Date(since);

                if (Number.isNaN(date.getTime())) {
                    throw new Error("Invalid Since date.");
                }

                params.set("since", date.toISOString());
            }

            if (until) {
                const date = new Date(until);

                if (Number.isNaN(date.getTime())) {
                    throw new Error("Invalid Until date.");
                }

                params.set("until", date.toISOString());
            }

            if (service.trim()) {
                params.set("service", service.trim());
            }

            if (level) {
                params.set("level", level);
            }

            if (attributeKey.trim() && attributeValue.trim()) {
                params.set(
                    `attr.${attributeKey.trim()} `,
                    attributeValue.trim()
                );
            }

            if (searchText.trim()) {
                params.set("q", searchText.trim());
            }

            const response = await fetch(
                `${API_BASE_URL}/logs/aggregate?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error(`Request failed: HTTP ${response.status} `);
            }

            const data: AggregationResponse = await response.json();

            if (!Array.isArray(data.buckets)) {
                throw new Error("Unexpected aggregation response format.");
            }

            setResults(data.buckets);
        } catch (err) {
            setResults(null);

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to fetch aggregations."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="panel" id="aggregations">
            <div className="panel-header">
                <div>
                    <h2>Aggregations</h2>
                    <p>Aggregate logs over a specific period.</p>
                </div>

                <button
                    className="primary-button"
                    type="submit"
                    form="aggregation-form"
                    disabled={loading}
                >
                    {loading ? "Aggregating..." : "Run Aggregation"}
                </button>
            </div>

            <form
                id="aggregation-form"
                className="filter-grid"
                onSubmit={handleAggregation}
            >
                <label>
                    Bucket
                    <select
                        value={bucket}
                        onChange={(event) => setBucket(event.target.value)}
                    >
                        <option value="1m">1 minute</option>
                        <option value="5m">5 minutes</option>
                        <option value="1h">1 hour</option>
                        <option value="1d">1 day</option>
                    </select>
                </label>

                <label>
                    Group by
                    <select
                        value={groupBy}
                        onChange={(event) => setGroupBy(event.target.value)}
                    >
                        <option value="level">Level</option>
                        <option value="service">Service</option>
                    </select>
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

                <details className="optional-filters">
                    <summary>Optional filters</summary>

                    <div className="filter-grid">
                        <label>
                            Service
                            <select
                                value={service}
                                onChange={(event) =>
                                    setService(event.target.value)
                                }
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
                                onChange={(event) =>
                                    setAttributeKey(event.target.value)
                                }
                                placeholder="e.g. region"
                            />
                        </label>

                        <label>
                            Attribute value
                            <input
                                value={attributeValue}
                                onChange={(event) =>
                                    setAttributeValue(event.target.value)
                                }
                                placeholder="e.g. eu-west"
                            />
                        </label>

                        <label>
                            Search text (q)
                            <input
                                value={searchText}
                                onChange={(event) =>
                                    setSearchText(event.target.value)
                                }
                                placeholder="e.g. payment declined"
                            />
                        </label>
                    </div>
                </details>
            </form>

            {error && (
                <div className="api-error" role="alert">
                    Unable to load aggregations: {error}
                </div>
            )}

            {loading && (
                <div className="empty-state">
                    Loading aggregation results...
                </div>
            )}

            {hasSearched && !loading && !error && results !== null && (
                <div className="aggregation-results">
                    <h3>Aggregation Results</h3>

                    {results.length === 0 ? (
                        <div className="empty-state">
                            No aggregation buckets found.
                        </div>
                    ) : (
                        <div className="logs-table-wrapper">
                            <table className="logs-table">
                                <thead>
                                    <tr>
                                        <th>Bucket Start</th>
                                        <th>Group</th>
                                        <th>Log Count</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {results.map((item, index) => (
                                        <tr
                                            key={`${item.start} -${item.group} -${index} `}
                                        >
                                            <td className="timestamp-cell">
                                                {new Date(
                                                    item.start
                                                ).toLocaleString()}
                                            </td>

                                            <td>
                                                <span className="service-name">
                                                    {item.group}
                                                </span>
                                            </td>

                                            <td>
                                                {item.count.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {!hasSearched && (
                <div className="empty-state">
                    Select your filters and run an aggregation.
                </div>
            )}
        </section>
    );
}

export default Aggregations;
