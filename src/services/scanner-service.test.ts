// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Use vi.hoisted() so mock factories can access these variables
const { socketEventHandlers, mockSocket, mockEnv } = vi.hoisted(() => {
  const socketEventHandlers: Record<string, ((...args: unknown[]) => void) | undefined> = {};
  let socketConnectCallback: (() => void) | undefined;

  const mockSocket = {
    setTimeout: vi.fn(),
    connect: vi.fn((_port: number, _host: string, cb: () => void) => {
      socketConnectCallback = cb;
    }),
    write: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      socketEventHandlers[event] = cb;
    }),
    destroy: vi.fn(),
    _getConnectCb: () => socketConnectCallback,
    _clearConnectCb: () => {
      socketConnectCallback = undefined;
    },
  };

  const mockEnv = {
    ENABLE_CLAMAV: "false",
    CLAMAV_HOST: "clamav",
    CLAMAV_PORT: 3310,
  };

  return { socketEventHandlers, mockSocket, mockEnv };
});

vi.mock("@/env", () => ({
  get env() {
    return mockEnv;
  },
}));

vi.mock("@/config/upload", () => ({
  UPLOAD_ALLOWED_MIME_TYPES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "video/mp4",
    "video/webm",
    "application/pdf",
  ] as const,
}));

// Mock file-type dynamic import
vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(),
}));

// Mock net using the hoisted mockSocket
vi.mock("node:net", () => ({
  Socket: function () {
    return mockSocket;
  },
}));

import {
  NoOpScannerService,
  ClamAvScannerService,
  verifyMagicBytes,
  createScannerService,
} from "./scanner-service";

const dummyBuffer = Buffer.from("dummy file content");

beforeEach(() => {
  vi.clearAllMocks();
  // Reset socket state
  for (const key of Object.keys(socketEventHandlers)) {
    delete socketEventHandlers[key];
  }
  mockSocket._clearConnectCb();
  mockEnv.ENABLE_CLAMAV = "false";

  // Restore mock implementations after clearAllMocks
  mockSocket.connect.mockImplementation((_port: number, _host: string, cb: () => void) => {
    // store cb via closure trick — reassign by calling setter
    mockSocket._clearConnectCb();
    (mockSocket as { _cb?: () => void })._cb = cb;
  });
  mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    socketEventHandlers[event] = cb;
  });
});

function fireConnectCallback() {
  const cb = (mockSocket as { _cb?: () => void })._cb;
  cb?.();
}

// ─── verifyMagicBytes ─────────────────────────────────────────────────────────

describe("verifyMagicBytes", () => {
  it("returns { clean: true } when detected MIME is on allowed list", async () => {
    const { fileTypeFromBuffer } = await import("file-type");
    vi.mocked(fileTypeFromBuffer).mockResolvedValue({ ext: "jpg", mime: "image/jpeg" });

    const result = await verifyMagicBytes(dummyBuffer);
    expect(result).toEqual({ clean: true });
  });

  it("returns { clean: true } when detected MIME matches declared MIME type", async () => {
    const { fileTypeFromBuffer } = await import("file-type");
    vi.mocked(fileTypeFromBuffer).mockResolvedValue({ ext: "jpg", mime: "image/jpeg" });

    const result = await verifyMagicBytes(dummyBuffer, "image/jpeg");
    expect(result).toEqual({ clean: true });
  });

  it("returns { clean: false } when detected MIME is not on allowed list", async () => {
    const { fileTypeFromBuffer } = await import("file-type");
    vi.mocked(fileTypeFromBuffer).mockResolvedValue({
      ext: "exe",
      mime: "application/x-msdownload",
    });

    const result = await verifyMagicBytes(dummyBuffer);
    expect(result.clean).toBe(false);
    expect(result.reason).toContain("disallowed_type");
    expect(result.reason).toContain("application/x-msdownload");
  });

  it("returns { clean: false } when fileTypeFromBuffer returns undefined (unknown type)", async () => {
    const { fileTypeFromBuffer } = await import("file-type");
    vi.mocked(fileTypeFromBuffer).mockResolvedValue(undefined);

    const result = await verifyMagicBytes(dummyBuffer);
    expect(result.clean).toBe(false);
    expect(result.reason).toContain("unknown_type");
  });

  it("returns { clean: false } when detected MIME doesn't match declared MIME type", async () => {
    const { fileTypeFromBuffer } = await import("file-type");
    vi.mocked(fileTypeFromBuffer).mockResolvedValue({ ext: "pdf", mime: "application/pdf" });

    const result = await verifyMagicBytes(dummyBuffer, "image/jpeg");
    expect(result.clean).toBe(false);
    expect(result.reason).toContain("type_mismatch");
    expect(result.reason).toContain("application/pdf");
    expect(result.reason).toContain("image/jpeg");
  });
});

// ─── NoOpScannerService ───────────────────────────────────────────────────────

describe("NoOpScannerService", () => {
  it("always returns { clean: true }", async () => {
    const scanner = new NoOpScannerService();
    const result = await scanner.scan("some-key", dummyBuffer);
    expect(result).toEqual({ clean: true });
  });
});

// ─── ClamAvScannerService ─────────────────────────────────────────────────────

describe("ClamAvScannerService", () => {
  it("returns { clean: true } when ClamAV responds 'stream: OK'", async () => {
    const scanner = new ClamAvScannerService();
    const scanPromise = scanner.scan("key", dummyBuffer);

    // Yield to allow socket event handlers to register
    await Promise.resolve();
    fireConnectCallback();
    socketEventHandlers["data"]?.(Buffer.from("stream: OK\n"));
    socketEventHandlers["end"]?.();

    const result = await scanPromise;
    expect(result.clean).toBe(true);
  });

  it("returns { clean: false } when ClamAV responds with FOUND", async () => {
    const scanner = new ClamAvScannerService();
    const scanPromise = scanner.scan("key", dummyBuffer);

    await Promise.resolve();
    fireConnectCallback();
    socketEventHandlers["data"]?.(Buffer.from("stream: Eicar-Test-Signature FOUND\n"));
    socketEventHandlers["end"]?.();

    const result = await scanPromise;
    expect(result.clean).toBe(false);
    expect(result.reason).toContain("virus:");
    expect(result.reason).toContain("Eicar-Test-Signature");
  });

  it("throws when TCP connection is refused (caller catches for pending_scan)", async () => {
    const scanner = new ClamAvScannerService();
    const scanPromise = scanner.scan("key", dummyBuffer);

    await Promise.resolve();
    socketEventHandlers["error"]?.(new Error("ECONNREFUSED"));

    await expect(scanPromise).rejects.toThrow("ECONNREFUSED");
  });
});

// ─── createScannerService ─────────────────────────────────────────────────────

describe("createScannerService", () => {
  it("returns NoOpScannerService when ENABLE_CLAMAV is not 'true'", () => {
    mockEnv.ENABLE_CLAMAV = "false";
    const service = createScannerService();
    expect(service).toBeInstanceOf(NoOpScannerService);
  });

  it("returns ClamAvScannerService when ENABLE_CLAMAV is 'true'", () => {
    mockEnv.ENABLE_CLAMAV = "true";
    const service = createScannerService();
    expect(service).toBeInstanceOf(ClamAvScannerService);
  });
});
