import { describe, it, expect, vi } from "vitest";
import { sseLogsHandler, broadcastLogs, getConnectedSSEClientCount } from "../sse.js";
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

    it("broadcasts logs to connected SSE clients", () => {
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

        const sampleLogs = [
            {
                service: "test-service",
                level: "info",
                message: "Test log message",
                timestamp: new Date("2026-10-29T12:00:00Z"),
                attributes: { user: "alice" },
            },
        ];

        broadcastLogs(sampleLogs);

        const sseMessages = writtenData.filter((d) => d.startsWith("data: "));
        expect(sseMessages.length).toBe(1);

        const payload = JSON.parse(sseMessages[0].replace(/^data: /, "").trim());
        expect(payload).toHaveLength(1);
        expect(payload[0].service).toBe("test-service");
        expect(payload[0].level).toBe("info");
        expect(payload[0].message).toBe("Test log message");
        expect(payload[0].attributes).toEqual({ user: "alice" });

        req.emit("close");
    });
});
