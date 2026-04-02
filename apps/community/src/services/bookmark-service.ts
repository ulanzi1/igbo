import "server-only";
import {
  toggleBookmark as dbToggleBookmark,
  addBookmark as dbAddBookmark,
  removeBookmark as dbRemoveBookmark,
  getUserBookmarks as dbGetUserBookmarks,
  type BookmarkedPost,
} from "@/db/queries/bookmarks";

export type { BookmarkedPost };

export async function toggleBookmark(
  userId: string,
  postId: string,
): Promise<{ bookmarked: boolean }> {
  return dbToggleBookmark(userId, postId);
}

export async function addBookmark(
  userId: string,
  postId: string,
): Promise<{ bookmarked: boolean }> {
  return dbAddBookmark(userId, postId);
}

export async function removeBookmark(
  userId: string,
  postId: string,
): Promise<{ bookmarked: boolean }> {
  return dbRemoveBookmark(userId, postId);
}

export async function getUserBookmarks(
  userId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<{ posts: BookmarkedPost[]; nextCursor: string | null }> {
  return dbGetUserBookmarks(userId, options);
}
