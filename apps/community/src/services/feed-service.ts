import "server-only";
import {
  getTotalPostCount,
  getFollowedUserIds,
  getFeedPosts,
  type FeedPage,
  type GetFeedOptions,
} from "@igbo/db/queries/feed";

export type { FeedPage, FeedPost, FeedPostMedia } from "@igbo/db/queries/feed";

export async function getFeed(viewerId: string, options: GetFeedOptions = {}): Promise<FeedPage> {
  const [totalPosts, followedIds] = await Promise.all([
    getTotalPostCount(),
    getFollowedUserIds(viewerId),
  ]);
  return getFeedPosts(viewerId, followedIds, totalPosts, options);
}
