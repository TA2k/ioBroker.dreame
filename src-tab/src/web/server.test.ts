import { describe, expect, it } from "vitest";
import { pickConnect, serverBase } from "./server";

function memoryStorage(initial: Record<string, string> = {}): Storage {
	const data = new Map(Object.entries(initial));
	return {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: key => void data.delete(key),
		clear: () => data.clear(),
		key: index => [...data.keys()][index] ?? null,
		get length() {
			return data.size;
		},
	};
}

describe("serverBase", () => {
	it("takes the page's own origin, the normal case", () => {
		expect(serverBase("", "http://host:8082", "http:", memoryStorage())).toBe("http://host:8082");
	});

	it("prefers ?iob= and remembers it for the next visit", () => {
		const storage = memoryStorage();
		expect(serverBase("?iob=http://other:8082/", "http://host:8082", "http:", storage)).toBe("http://other:8082");
		expect(serverBase("", "http://host:8082", "http:", storage)).toBe("http://other:8082");
	});

	it("has no server for a file opened without one", () => {
		expect(serverBase("", "null", "file:", memoryStorage())).toBeNull();
	});
});

describe("pickConnect", () => {
	it("uses the socket.io client, which is a function itself", () => {
		const io = (): string => "socket";
		expect(pickConnect(io)).toBe(io);
	});

	it("uses the pure-websocket shim's connect", () => {
		const connect = (): string => "socket";
		expect(pickConnect({ connect })).toBe(connect);
	});

	it("finds nothing where no client was loaded", () => {
		expect(pickConnect(undefined)).toBeNull();
		expect(pickConnect({})).toBeNull();
	});
});
