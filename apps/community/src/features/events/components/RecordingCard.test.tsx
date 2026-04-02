// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${ns}.${key}:${JSON.stringify(params)}`;
    }
    return `${ns}.${key}`;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    asChild,
    size: _size,
    variant: _variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    asChild?: boolean;
    size?: string;
    variant?: string;
  }) => {
    if (asChild) return <>{children}</>;
    return (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

import { RecordingCard } from "./RecordingCard";

const EVENT_ID = "event-abc";
const MIRROR_URL = "https://storage.example.com/rec.mp4";
const SOURCE_URL = "https://download.daily.co/rec.mp4";

const defaultProps = {
  eventId: EVENT_ID,
  recordingStatus: "ready" as const,
  recordingUrl: SOURCE_URL,
  mirrorUrl: MIRROR_URL,
  expiresAt: new Date("2026-06-01T00:00:00Z"),
  isPreserved: false,
  isCreatorOrAdmin: false,
};

describe("RecordingCard", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe("lost state", () => {
    it("shows recording unavailable message", () => {
      render(<RecordingCard {...defaultProps} recordingStatus="lost" />);
      expect(screen.getByText("Events.recordings.recordingLost")).toBeInTheDocument();
    });
  });

  describe("mirroring state", () => {
    it("shows processing message", () => {
      render(<RecordingCard {...defaultProps} recordingStatus="mirroring" mirrorUrl={null} />);
      expect(screen.getByText("Events.recordings.mirrorPending")).toBeInTheDocument();
    });

    it("shows source play button when recording URL is available during mirroring", () => {
      render(
        <RecordingCard
          {...defaultProps}
          recordingStatus="mirroring"
          mirrorUrl={null}
          recordingUrl={SOURCE_URL}
        />,
      );
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", SOURCE_URL);
    });
  });

  describe("ready state", () => {
    it("shows play link pointing to mirror URL", () => {
      render(<RecordingCard {...defaultProps} />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", MIRROR_URL);
    });

    it("shows expiry badge when not preserved", () => {
      render(<RecordingCard {...defaultProps} isPreserved={false} />);
      expect(screen.getByTestId("badge")).toBeInTheDocument();
    });

    it("shows preserved badge when recording is preserved", () => {
      render(<RecordingCard {...defaultProps} isPreserved={true} expiresAt={null} />);
      expect(screen.getByText("Events.recordings.preservedLabel")).toBeInTheDocument();
    });

    it("shows download button when mirror URL is available", () => {
      render(<RecordingCard {...defaultProps} />);
      expect(screen.getByText("Events.recordings.downloadButton")).toBeInTheDocument();
    });

    it("hides download button when mirror URL is null", () => {
      render(<RecordingCard {...defaultProps} mirrorUrl={null} />);
      expect(screen.queryByText("Events.recordings.downloadButton")).not.toBeInTheDocument();
    });

    it("shows preserve button only to creator/admin when not yet preserved", () => {
      render(<RecordingCard {...defaultProps} isCreatorOrAdmin={true} isPreserved={false} />);
      expect(screen.getByText("Events.recordings.preserveButton")).toBeInTheDocument();
    });

    it("hides preserve button for non-creator", () => {
      render(<RecordingCard {...defaultProps} isCreatorOrAdmin={false} />);
      expect(screen.queryByText("Events.recordings.preserveButton")).not.toBeInTheDocument();
    });

    it("hides preserve button when already preserved", () => {
      render(
        <RecordingCard
          {...defaultProps}
          isCreatorOrAdmin={true}
          isPreserved={true}
          expiresAt={null}
        />,
      );
      expect(screen.queryByText("Events.recordings.preserveButton")).not.toBeInTheDocument();
    });
  });

  describe("preserve action", () => {
    it("calls preserve API and updates state on success", async () => {
      vi.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 200 }));

      render(<RecordingCard {...defaultProps} isCreatorOrAdmin={true} />);
      fireEvent.click(screen.getByText("Events.recordings.preserveButton"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/v1/events/${EVENT_ID}/recording/preserve`,
          expect.objectContaining({ method: "POST" }),
        );
      });

      // After success, preserve button should be gone
      await waitFor(() => {
        expect(screen.queryByText("Events.recordings.preserveButton")).not.toBeInTheDocument();
      });
    });

    it("does not update state when preserve API fails", async () => {
      vi.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 403 }));

      render(<RecordingCard {...defaultProps} isCreatorOrAdmin={true} />);
      fireEvent.click(screen.getByText("Events.recordings.preserveButton"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Button should still be visible after failure
      expect(screen.getByText("Events.recordings.preserveButton")).toBeInTheDocument();
    });
  });

  describe("null / no-render cases", () => {
    it("returns null when status is pending and no expiresAt", () => {
      const { container } = render(
        <RecordingCard
          {...defaultProps}
          recordingStatus={"pending" as "ready"}
          expiresAt={null}
          mirrorUrl={null}
          recordingUrl={null}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
