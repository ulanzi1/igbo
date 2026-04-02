import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileUpload } from "./FileUpload";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    const translations: Record<string, string> = {
      selectFile: "Select file",
      dragAndDrop: "Drag and drop a file here, or click to select",
      uploading: "Uploading...",
      processing: "Processing...",
      uploadComplete: "Upload complete",
      errorInvalidType: "File type not allowed",
      errorTooLarge: `File is too large. Maximum size: ${params?.maxSize ?? ""}`,
      errorUploadFailed: "Upload failed. Please try again.",
      errorQuarantined: "Your file could not be uploaded. Please try a different file.",
      maxSizeHint: `Maximum file size: ${params?.maxSize ?? ""}`,
    };
    return translations[key] ?? key;
  },
}));

vi.mock("@igbo/config/upload", () => ({
  UPLOAD_CATEGORY_MIME_TYPES: {
    image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
    video: ["video/mp4", "video/webm"],
    document: ["application/pdf"],
    profile_photo: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  },
  UPLOAD_SIZE_LIMITS: {
    image: 10 * 1024 * 1024,
    video: 100 * 1024 * 1024,
    document: 25 * 1024 * 1024,
    profile_photo: 5 * 1024 * 1024,
  },
}));

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// XMLHttpRequest mock with progress support
class MockXHR {
  static instances: MockXHR[] = [];
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 200;
  responseText = "";
  open = vi.fn();
  setRequestHeader = vi.fn();
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

const PRESIGN_SUCCESS = {
  data: {
    uploadUrl: "https://presigned.example.com/upload",
    objectKey: "uploads/user-123/photo.jpg",
    fileUploadId: "upload-record-id",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  MockXHR.instances = [];
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FileUpload", () => {
  it("renders file input element", () => {
    render(<FileUpload category="image" onUploadComplete={vi.fn()} />);
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
  });

  it("shows select file text initially", () => {
    render(<FileUpload category="image" onUploadComplete={vi.fn()} />);
    expect(screen.getByText("Select file")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(<FileUpload category="image" onUploadComplete={vi.fn()} disabled />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("uploads via XHR to /api/upload/file and calls onUploadComplete on success", async () => {
    const onUploadComplete = vi.fn();
    render(<FileUpload category="image" onUploadComplete={onUploadComplete} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["file-content"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    // Wait for XHR to be created
    await waitFor(() => expect(MockXHR.instances.length).toBeGreaterThan(0));

    const xhr = MockXHR.instances[0];
    // Verify XHR was opened to the proxy route
    expect(xhr.open).toHaveBeenCalledWith("POST", "/api/upload/file");

    // Set response and trigger load
    xhr.responseText = JSON.stringify({
      data: {
        fileUploadId: "upload-record-id",
        objectKey: "uploads/user-123/photo.jpg",
        publicUrl: "https://presigned.example.com/upload",
      },
    });
    xhr.triggerLoad(200);

    await waitFor(() =>
      expect(onUploadComplete).toHaveBeenCalledWith(
        "upload-record-id",
        "uploads/user-123/photo.jpg",
        "https://presigned.example.com/upload",
      ),
    );
  });

  it("calls onError when the upload XHR returns an error response", async () => {
    const onError = vi.fn();
    render(<FileUpload category="image" onUploadComplete={vi.fn()} onError={onError} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "virus.exe", { type: "application/x-msdownload" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(MockXHR.instances.length).toBeGreaterThan(0));

    const xhr = MockXHR.instances[0];
    xhr.responseText = JSON.stringify({ detail: "File type not allowed" });
    xhr.triggerLoad(400);

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith("File type not allowed");
  });

  it("shows max size hint text", () => {
    render(<FileUpload category="image" onUploadComplete={vi.fn()} />);
    expect(screen.getByText("Maximum file size: 10MB")).toBeInTheDocument();
  });

  it("rejects oversized files client-side without calling presign API", async () => {
    const onError = vi.fn();
    render(<FileUpload category="profile_photo" onUploadComplete={vi.fn()} onError={onError} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // 6MB file > 5MB profile_photo limit
    const oversizedContent = new Array(6 * 1024 * 1024 + 1).join("x");
    const file = new File([oversizedContent], "big-photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("too large"));
    // Should NOT have called the presign API
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows upload progress indicator during upload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(PRESIGN_SUCCESS),
    });

    render(<FileUpload category="image" onUploadComplete={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["file-content"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    // Wait for uploading state
    await waitFor(() => screen.getByText("Uploading..."));
    expect(screen.getByText("Uploading...")).toBeInTheDocument();

    // Simulate XHR progress
    await waitFor(() => expect(MockXHR.instances.length).toBeGreaterThan(0));
    const xhr = MockXHR.instances[0];

    // Fire a progress event
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);

    await waitFor(() => {
      const progressBar = screen.queryByRole("progressbar");
      expect(progressBar).toBeInTheDocument();
    });
  });
});
