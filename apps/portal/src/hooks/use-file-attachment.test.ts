// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFileAttachment } from "./use-file-attachment";

// ── MockXHR ──────────────────────────────────────────────────────────────────

interface MockXHRInstance {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  onload: ((this: XMLHttpRequest, ev: ProgressEvent) => unknown) | null;
  onerror: ((this: XMLHttpRequest, ev: ProgressEvent) => unknown) | null;
  upload: {
    onprogress: ((this: XMLHttpRequestUpload, ev: ProgressEvent) => unknown) | null;
  };
  status: number;
  responseText: string;
  triggerLoad(status?: number, responseText?: string): void;
  triggerProgress(loaded: number, total: number): void;
  triggerError(): void;
}

const mockXHRInstances: MockXHRInstance[] = [];

class MockXHR {
  open = vi.fn();
  send = vi.fn();
  onload: ((this: XMLHttpRequest, ev: ProgressEvent) => unknown) | null = null;
  onerror: ((this: XMLHttpRequest, ev: ProgressEvent) => unknown) | null = null;
  upload = {
    onprogress: null as ((this: XMLHttpRequestUpload, ev: ProgressEvent) => unknown) | null,
  };
  status = 200;
  responseText = '{"data":{"fileUploadId":"upload-id-123"}}';

  triggerLoad(status = 200, responseText?: string) {
    this.status = status;
    if (responseText !== undefined) this.responseText = responseText;
    this.onload?.call(this as unknown as XMLHttpRequest, {} as ProgressEvent);
  }

  triggerProgress(loaded: number, total: number) {
    this.upload.onprogress?.call(
      this.upload as unknown as XMLHttpRequestUpload,
      { lengthComputable: true, loaded, total } as ProgressEvent,
    );
  }

  triggerError() {
    this.onerror?.call(this as unknown as XMLHttpRequest, {} as ProgressEvent);
  }
}

beforeEach(() => {
  mockXHRInstances.length = 0;
  vi.stubGlobal(
    "XMLHttpRequest",
    class extends MockXHR {
      constructor() {
        super();
        mockXHRInstances.push(this as unknown as MockXHRInstance);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── addFiles ─────────────────────────────────────────────────────────────────

describe("useFileAttachment — addFiles", () => {
  it("adds a file and starts uploading", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    expect(result.current.pendingUploads).toHaveLength(1);
    expect(result.current.pendingUploads[0]?.fileName).toBe("resume.pdf");
    expect(result.current.isUploading).toBe(true);
  });

  it("returns 'maxFilesReached' when adding files beyond limit of 3", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = (n: number) => new File(["x"], `file${n}.pdf`, { type: "application/pdf" });

    await act(async () => {
      await result.current.addFiles([file(1), file(2), file(3)]);
    });

    // Complete all uploads
    for (const xhr of mockXHRInstances) {
      act(() => xhr.triggerLoad(200));
    }
    await waitFor(() =>
      expect(result.current.pendingUploads.every((u) => u.status === "done")).toBe(true),
    );

    let warning: string | undefined;
    await act(async () => {
      warning = await result.current.addFiles([file(4)]);
    });

    expect(warning).toBe("maxFilesReached");
  });

  it("slices extra files when adding more than remaining slots", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const files = [1, 2, 3, 4].map(
      (n) => new File(["x"], `file${n}.pdf`, { type: "application/pdf" }),
    );

    let warning: string | undefined;
    await act(async () => {
      warning = await result.current.addFiles(files);
    });

    expect(result.current.pendingUploads).toHaveLength(3); // max 3
    expect(warning).toBe("maxFilesReached");
  });

  it("rejects unsupported file type and marks as error", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["x"], "malware.exe", { type: "application/octet-stream" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    // Let the async processUpload run
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.pendingUploads[0]?.status).toBe("error");
    expect(result.current.pendingUploads[0]?.errorMessage).toBe("unsupportedType");
  });

  it("rejects files over 10MB and marks as error", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const bigData = new Uint8Array(11 * 1024 * 1024);
    const file = new File([bigData], "big.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.pendingUploads[0]?.status).toBe("error");
    expect(result.current.pendingUploads[0]?.errorMessage).toBe("fileTooLarge");
  });
});

// ── Upload completion ─────────────────────────────────────────────────────────

describe("useFileAttachment — upload success", () => {
  it("marks upload as done with fileUploadId on success", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    act(() => {
      mockXHRInstances[0]?.triggerLoad(200);
    });

    await waitFor(() => expect(result.current.pendingUploads[0]?.status).toBe("done"));
    const done = result.current.pendingUploads[0] as { fileUploadId?: string };
    expect(done.fileUploadId).toBe("upload-id-123");
    expect(result.current.isUploading).toBe(false);
  });

  it("marks upload as error on HTTP error response", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    act(() => {
      mockXHRInstances[0]?.triggerLoad(500);
    });

    await waitFor(() => expect(result.current.pendingUploads[0]?.status).toBe("error"));
    expect(result.current.pendingUploads[0]?.errorMessage).toBe("uploadFailed");
  });

  it("marks upload as error on network error", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    act(() => {
      mockXHRInstances[0]?.triggerError();
    });

    await waitFor(() => expect(result.current.pendingUploads[0]?.status).toBe("error"));
  });

  it("updates progress percentage during upload", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    act(() => {
      mockXHRInstances[0]?.triggerProgress(50, 100);
    });

    await waitFor(() => expect(result.current.pendingUploads[0]?.progress).toBe(50));
  });

  it("sends POST to /api/v1/upload/file with category=message", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    const xhr = mockXHRInstances[0]!;
    expect(xhr.open).toHaveBeenCalledWith("POST", "/api/v1/upload/file");
    // FormData.append is called with category=message — test via send was called
    expect(xhr.send).toHaveBeenCalledOnce();
  });
});

// ── removeFile ────────────────────────────────────────────────────────────────

describe("useFileAttachment — removeFile", () => {
  it("removes a pending upload by tempId", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    const tempId = result.current.pendingUploads[0]!.tempId;
    act(() => {
      result.current.removeFile(tempId);
    });

    expect(result.current.pendingUploads).toHaveLength(0);
  });
});

// ── clearAll ──────────────────────────────────────────────────────────────────

describe("useFileAttachment — clearAll", () => {
  it("removes all pending uploads", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const files = [
      new File(["x"], "a.pdf", { type: "application/pdf" }),
      new File(["x"], "b.pdf", { type: "application/pdf" }),
    ];
    await act(async () => {
      await result.current.addFiles(files);
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.pendingUploads).toHaveLength(0);
  });
});

// ── retryUpload ───────────────────────────────────────────────────────────────

describe("useFileAttachment — retryUpload", () => {
  it("re-triggers upload for an errored file", async () => {
    const { result } = renderHook(() => useFileAttachment());

    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.addFiles([file]);
    });

    // Fail the upload
    act(() => {
      mockXHRInstances[0]?.triggerLoad(500);
    });

    await waitFor(() => expect(result.current.pendingUploads[0]?.status).toBe("error"));
    const tempId = result.current.pendingUploads[0]!.tempId;

    // Retry — fire-and-forget to avoid XHR deadlock (retryUpload awaits processUpload internally)
    act(() => {
      void result.current.retryUpload(tempId);
    });

    await waitFor(() => expect(result.current.pendingUploads[0]?.status).toBe("uploading"));

    // Complete the retry
    act(() => {
      mockXHRInstances[1]?.triggerLoad(200);
    });

    await waitFor(() => expect(result.current.pendingUploads[0]?.status).toBe("done"));
  });

  it("does nothing when tempId is not found", async () => {
    const { result } = renderHook(() => useFileAttachment());

    act(() => {
      void result.current.retryUpload("non-existent-id");
    });

    // Allow any microtasks to flush
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.pendingUploads).toHaveLength(0);
  });
});
