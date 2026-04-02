import "server-only";
import * as net from "node:net";
import { env } from "@/env";
import { UPLOAD_ALLOWED_MIME_TYPES } from "@igbo/config/upload";

export interface ScanResult {
  clean: boolean;
  reason?: string; // "virus: {name}" or "invalid_type: detected {detected}, declared {declared}"
}

// ScannerService is for virus/malware scanning only.
// Magic byte verification is a separate step in processFileRecord (always runs).
export interface ScannerService {
  scan(objectKey: string, fileBuffer: Buffer): Promise<ScanResult>;
}

// No-op virus scanner for launch mode — always returns clean.
// Magic byte verification is handled separately in processFileRecord.
export class NoOpScannerService implements ScannerService {
  async scan(_objectKey: string, _fileBuffer: Buffer): Promise<ScanResult> {
    return { clean: true };
  }
}

export class ClamAvScannerService implements ScannerService {
  private host: string;
  private port: number;

  constructor() {
    this.host = env.CLAMAV_HOST ?? "clamav";
    this.port = env.CLAMAV_PORT ?? 3310;
  }

  async scan(_objectKey: string, fileBuffer: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const CHUNK_SIZE = 4096;
      const TIMEOUT_MS = 30_000;
      let response = "";

      socket.setTimeout(TIMEOUT_MS);

      socket.connect(this.port, this.host, () => {
        // Send zINSTREAM command (null-terminated)
        socket.write(Buffer.from("zINSTREAM\0"));

        // Send file in chunks with 4-byte big-endian length prefix
        let offset = 0;
        while (offset < fileBuffer.length) {
          const chunk = fileBuffer.subarray(offset, offset + CHUNK_SIZE);
          const sizeBuf = Buffer.allocUnsafe(4);
          sizeBuf.writeUInt32BE(chunk.length, 0);
          socket.write(sizeBuf);
          socket.write(chunk);
          offset += CHUNK_SIZE;
        }

        // Send 4 zero bytes to signal end of stream
        socket.write(Buffer.alloc(4));
      });

      socket.on("data", (data: Buffer) => {
        response += data.toString();
      });

      socket.on("end", () => {
        socket.destroy();
        const trimmed = response.trim();
        if (trimmed.endsWith("OK")) {
          resolve({ clean: true });
        } else if (trimmed.includes("FOUND")) {
          // e.g. "stream: Eicar-Test-Signature FOUND"
          const virusName = trimmed.replace(/^stream:\s+/, "").replace(/\s+FOUND$/, "");
          resolve({ clean: false, reason: `virus: ${virusName}` });
        } else {
          resolve({ clean: false, reason: `unknown_response: ${trimmed}` });
        }
      });

      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("ClamAV connection timed out"));
      });

      socket.on("error", (err: Error) => {
        reject(err);
      });
    });
  }
}

// Standalone magic byte verification — called by processFileRecord ALWAYS,
// regardless of which ScannerService is active.
// When declaredMimeType is provided, also rejects files whose detected type
// doesn't match the declared MIME type (AC 3 requirement).
export async function verifyMagicBytes(
  fileBuffer: Buffer,
  declaredMimeType?: string,
): Promise<ScanResult> {
  const { fileTypeFromBuffer } = await import("file-type");
  const result = await fileTypeFromBuffer(fileBuffer);
  if (!result) {
    return { clean: false, reason: "unknown_type: could not detect file type from magic bytes" };
  }
  if (
    !UPLOAD_ALLOWED_MIME_TYPES.includes(result.mime as (typeof UPLOAD_ALLOWED_MIME_TYPES)[number])
  ) {
    return { clean: false, reason: `disallowed_type: ${result.mime}` };
  }
  if (declaredMimeType && result.mime !== declaredMimeType) {
    return {
      clean: false,
      reason: `type_mismatch: detected ${result.mime}, declared ${declaredMimeType}`,
    };
  }
  return { clean: true };
}

export function createScannerService(): ScannerService {
  return env.ENABLE_CLAMAV === "true" ? new ClamAvScannerService() : new NoOpScannerService();
}
