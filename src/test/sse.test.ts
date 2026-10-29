import { describe, it, expect, vi } from "vitest";
import { sseLogsHandler, broadcastLogs, flushSSEBuffer, getConnectedSSEClientCount } from "../sse.js";
import { EventEmitter } from "node:events";

describe("SSE Handler and Broadcaster", () => {
    it("registers SSE client, sets correct headers, and unregisters on close", () => {
        const req = new EventEmitter() as any;
        const headers: Record<string, string> = {};
        const writtenData: string[] = [];

        const res = {
            setHeader: vi.fn((key: string, value: string) => {
                headers[key] = value;
            }),
            flushHeaders: vi.fn(),
            write: vi.fn((chunk: string) => {
                writtenData.push(chunk);
                return true;
            }),
        } as any;

        const countBefore = getConnectedSSEClientCount();
        sseLogsHandler(req, res);

        expect(getConnectedSSEClientCount()).toBe(countBefore + 1);
        expect(headers["Content-Type"]).toBe("text/event-stream");
        expect(headers["Cache-Control"]).toBe("no-cache");
        expect(headers["Connection"]).toBe("keep-alive");
        expect(writtenData).toContain(": connected\n\n");

        // Simulate client disconnecting
        req.emit("close");
        expect(getConnectedSSEClientCount()).toBe(countBefore);
    });

    it("batches logs and sends them to connected SSE clients", async () => {
        const req = new EventEmitter() as any;
        const writtenData: string[] = [];

        const res = {
            setHeader: vi.fn(),
            flushHeaders: vi.fn(),
            write: vi.fn((chunk: string) => {
                writtenData.push(chunk);
                return true;
            }),
        } as any;

        sseLogsHandler(req, res);

        const sampleLogs1 = [
            {
                service: "test-service",
                level: "info",
                message: "Test log message 1",
                timestamp: new Date("2026-10-29T12:00:00Z"),
                attributes: { user: "alice" },
            },
        ];

        const sampleLogs2 = [
            {
                service: "auth-service",
                level: "warn",
                message: "Test log message 2",
                timestamp: new Date("2026-10-29T12:00:01Z"),
                attributes: { user: "bob" },
            },
        ];

        // Call broadcastLogs twice in rapid succession
        broadcastLogs(sampleLogs1);
        broadcastLogs(sampleLogs2);

        // Wait for the 3ms buffer to flush automatically
        await new Promise((resolve) => setTimeout(resolve, 15));

        const sseMessages = writtenData.filter((d) => d.startsWith("data: "));
        // Both log batches should have been combined into a single SSE frame
        expect(sseMessages.length).toBe(1);

        const payload = JSON.parse(sseMessages[0].replace(/^data: /, "").trim());
        expect(payload).toHaveLength(2);
        expect(payload[0].message).toBe("Test log message 1");
        expect(payload[1].message).toBe("Test log message 2");

        req.emit("close");
    });
});
