// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/bookmarks", () => ({
  toggleBookmark: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  getUserBookmarks: vi.fn(),
}));

import { toggleBookmark, addBookmark, removeBookmark, getUserBookmarks } from "./bookmark-service";
import * as dbBookmarks from "@igbo/db/queries/bookmarks";

const mockDbToggle = vi.mocked(dbBookmarks.toggleBookmark);
const mockDbAdd = vi.mocked(dbBookmarks.addBookmark);
const mockDbRemove = vi.mocked(dbBookmarks.removeBookmark);
const mockDbGetUserBookmarks = vi.mocked(dbBookmarks.getUserBookmarks);

const USER_ID = "00000000-0000-4000-8000-000000000001";
const POST_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  mockDbToggle.mockReset();
  mockDbAdd.mockReset();
  mockDbRemove.mockReset();
  mockDbGetUserBookmarks.mockReset();
});

describe("bookmark-service", () => {
  describe("toggleBookmark", () => {
    it("calls db toggleBookmark with correct args and returns result", async () => {
      mockDbToggle.mockResolvedValueOnce({ bookmarked: true });

      const result = await toggleBookmark(USER_ID, POST_ID);

      expect(mockDbToggle).toHaveBeenCalledWith(USER_ID, POST_ID);
      expect(result).toEqual({ bookmarked: true });
    });

    it("returns { bookmarked: false } when db returns false", async () => {
      mockDbToggle.mockResolvedValueOnce({ bookmarked: false });

      const result = await toggleBookmark(USER_ID, POST_ID);

      expect(result).toEqual({ bookmarked: false });
    });
  });

  describe("addBookmark", () => {
    it("calls db addBookmark with correct args and returns result", async () => {
      mockDbAdd.mockResolvedValueOnce({ bookmarked: true });

      const result = await addBookmark(USER_ID, POST_ID);

      expect(mockDbAdd).toHaveBeenCalledWith(USER_ID, POST_ID);
      expect(result).toEqual({ bookmarked: true });
    });
  });

  describe("removeBookmark", () => {
    it("calls db removeBookmark with correct args and returns result", async () => {
      mockDbRemove.mockResolvedValueOnce({ bookmarked: false });

      const result = await removeBookmark(USER_ID, POST_ID);

      expect(mockDbRemove).toHaveBeenCalledWith(USER_ID, POST_ID);
      expect(result).toEqual({ bookmarked: false });
    });
  });

  describe("getUserBookmarks", () => {
    it("calls db getUserBookmarks with userId and default options", async () => {
      mockDbGetUserBookmarks.mockResolvedValueOnce({ posts: [], nextCursor: null });

      await getUserBookmarks(USER_ID);

      expect(mockDbGetUserBookmarks).toHaveBeenCalledWith(USER_ID, {});
    });

    it("calls db getUserBookmarks with userId and provided options", async () => {
      mockDbGetUserBookmarks.mockResolvedValueOnce({ posts: [], nextCursor: null });
      const options = { cursor: "2026-03-01T10:00:00.000Z", limit: 5 };

      await getUserBookmarks(USER_ID, options);

      expect(mockDbGetUserBookmarks).toHaveBeenCalledWith(USER_ID, options);
    });
  });
});
