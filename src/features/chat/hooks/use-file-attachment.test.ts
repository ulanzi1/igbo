// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock upload config
vi.mock("@/config/upload", () => ({
  UPLOAD_ALLOWED_MIME_TYPES: [
    "image/jpeg",
    "image/png",
    "video/mp4",
    "application/pdf",
    "audio/mpeg",
    "audio/wav",
  ],
  UPLOAD_SIZE_LIMITS: {
    image: 10 * 1024 * 1024,
    video: 100 * 1024 * 1024,
    document: 25 * 1024 * 1024,
    audio: 50 * 1024 * 1024,
    profile_photo: 5 * 1024 * 1024,
  },
  UPLOAD_CATEGORY_MIME_TYPES: {
    image: ["image/jpeg", "image/png"],
    video: ["video/mp4"],
    document: ["application/pdf"],
    audio: ["audio/mpeg", "audio/wav"],
    profile_photo: ["image/jpeg", "image/png"],
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// XMLHttpRequest mock — the hook POSTs to /api/upload/file via XHR (no fetch calls)
class MockXHR {
  static instances: MockXHR[] = [];
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 200;
  responseText = "";
  open = vi.fn();
  send = vi.fn();

  constructor() {
    MockXHR.instances.push(this);
  }

  triggerLoad(status = 200) {
    this.status = status;
    this.onload?.();
  }

  triggerError() {
    this.onerror?.();
  }
}
global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;

import { useFileAttachment } from "./use-file-attachment";

function makeFile(name: string, type: string, size = 100): File {
  const file = new File(["x".repeat(size)], name, { type });
  return file;
}

describe("useFileAttachment", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    MockXHR.instances = [];
  });

  it("starts with empty pendingUploads and isUploading=false", () => {
    const { result } = renderHook(() => useFileAttachment());
    expect(result.current.pendingUploads).toHaveLength(0);
    expect(result.current.isUploading).toBe(false);
  });

  it("rejects unsupported file types immediately", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = makeFile("bad.exe", "application/x-msdownload");
    await act(async () => {
      await result.current.addFiles([file]);
    });

    // Allow async processUpload to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pendingUploads).toHaveLength(1);
    expect(result.current.pendingUploads[0]?.status).toBe("error");
    expect(result.current.pendingUploads[0]?.errorMessage).toBe("unsupportedType");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects oversized files immediately", async () => {
    const { result } = renderHook(() => useFileAttachment());

    // Image limit is 10MB; create a file larger than that
    const bigFile = new File([new ArrayBuffer(11 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    await act(async () => {
      await result.current.addFiles([bigFile]);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pendingUploads[0]?.status).toBe("error");
    expect(result.current.pendingUploads[0]?.errorMessage).toBe("fileTooLarge");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("completes upload via single XHR POST to /api/upload/file", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = makeFile("photo.jpg", "image/jpeg");
    await act(async () => {
      await result.current.addFiles([file]);
    });

    // Let processUpload reach the XHR creation
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(MockXHR.instances.length).toBeGreaterThan(0);
    const xhr = MockXHR.instances[0];
    expect(xhr.open).toHaveBeenCalledWith("POST", "/api/upload/file");

    // Simulate successful server response
    xhr.responseText = JSON.stringify({ data: { fileUploadId: "file-upload-id-123" } });
    await act(async () => {
      xhr.triggerLoad(200);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pendingUploads[0]?.status).toBe("done");
    expect(result.current.isUploading).toBe(false);
    const upload = result.current.pendingUploads[0];
    expect("fileUploadId" in (upload ?? {})).toBe(true);
    expect((upload as { fileUploadId?: string }).fileUploadId).toBe("file-upload-id-123");
  });

  it("marks upload as error when XHR returns non-2xx status", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = makeFile("doc.pdf", "application/pdf");
    await act(async () => {
      await result.current.addFiles([file]);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(MockXHR.instances.length).toBeGreaterThan(0);
    await act(async () => {
      MockXHR.instances[0].triggerLoad(500);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pendingUploads[0]?.status).toBe("error");
    expect(result.current.pendingUploads[0]?.errorMessage).toBe("uploadFailed");
  });

  it("marks upload as error when XHR network error occurs", async () => {
    const { result } = renderHook(() => useFileAttachment());

    await act(async () => {
      await result.current.addFiles([makeFile("a.jpg", "image/jpeg")]);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(MockXHR.instances.length).toBeGreaterThan(0);
    await act(async () => {
      MockXHR.instances[0].triggerError();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pendingUploads[0]?.status).toBe("error");
  });

  it("removes file from list when removeFile called", async () => {
    const { result } = renderHook(() => useFileAttachment());

    // Add a file that will fail validation (so it stays in the list as error)
    await act(async () => {
      await result.current.addFiles([makeFile("bad.exe", "application/x-msdownload")]);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pendingUploads).toHaveLength(1);
    const tempId = result.current.pendingUploads[0]!.tempId;

    act(() => {
      result.current.removeFile(tempId);
    });

    expect(result.current.pendingUploads).toHaveLength(0);
  });

  it("limits to 10 attachments", async () => {
    const { result } = renderHook(() => useFileAttachment());

    // Add 12 files — only first 10 should be accepted
    const files = Array.from({ length: 12 }, (_, i) => makeFile(`file${i}.jpg`, "image/jpeg"));

    // Pre-fill with 8 files (all will fail with unsupported, but that's fine for the limit test)
    // Actually: use valid files but mock fetch to prevent actual network calls
    mockFetch.mockRejectedValue(new Error("network"));

    await act(async () => {
      await result.current.addFiles(files);
    });

    // Should only add up to MAX_ATTACHMENTS (10) - but since we start at 0, 10 are added
    expect(result.current.pendingUploads.length).toBeLessThanOrEqual(10);
  });
});
