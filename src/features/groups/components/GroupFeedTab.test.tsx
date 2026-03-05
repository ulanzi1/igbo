// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

vi.mock("@/features/feed/components/PostComposer", () => ({
  PostComposer: () => <div data-testid="post-composer" />,
}));

vi.mock("@/features/feed/components/FeedItem", () => ({
  FeedItem: ({ post }: { post: { id: string; status: string } }) => (
    <div data-testid="feed-item" data-post-id={post.id} data-status={post.status} />
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

import { GroupFeedTab } from "./GroupFeedTab";

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const VIEWER_ID = "00000000-0000-4000-8000-000000000002";
const POST_ID = "00000000-0000-4000-8000-000000000003";
const PENDING_ID = "00000000-0000-4000-8000-000000000004";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000005";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderTab(
  props: Partial<React.ComponentProps<typeof GroupFeedTab>> = {},
  fetchMock?: typeof global.fetch,
) {
  const client = makeClient();
  if (fetchMock) global.fetch = fetchMock;
  return render(
    <QueryClientProvider client={client}>
      <GroupFeedTab
        groupId={GROUP_ID}
        viewerId={VIEWER_ID}
        viewerRole={props.viewerRole ?? "member"}
        viewerDisplayName="Alice"
        viewerPhotoUrl={null}
        canPost={props.canPost ?? true}
        isModerated={props.isModerated ?? false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

function makeFeedResponse(posts = []) {
  return Promise.resolve(
    new Response(JSON.stringify({ data: { posts, nextCursor: null } }), { status: 200 }),
  );
}

function makePendingResponse(posts = [], nextCursor: string | null = null) {
  return Promise.resolve(
    new Response(JSON.stringify({ data: { posts, nextCursor } }), { status: 200 }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GroupFeedTab", () => {
  it("shows empty state when feed has no posts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { posts: [], nextCursor: null } }), { status: 200 }),
      );
    renderTab({}, fetchMock);
    await waitFor(() => {
      expect(screen.getByText("feed.empty")).toBeInTheDocument();
    });
  });

  it("renders feed items returned by the API", async () => {
    const posts = [
      {
        id: POST_ID,
        authorId: VIEWER_ID,
        authorDisplayName: "Alice",
        authorPhotoUrl: null,
        content: "Hello",
        contentType: "text",
        visibility: "group",
        groupId: GROUP_ID,
        isPinned: false,
        pinnedAt: null,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        category: "discussion",
        originalPostId: null,
        originalPost: null,
        status: "active",
        media: [],
        isBookmarked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { posts, nextCursor: null } }), { status: 200 }),
      );
    renderTab({}, fetchMock);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item")).toBeInTheDocument();
    });
    expect(screen.getByTestId("feed-item")).toHaveAttribute("data-post-id", POST_ID);
  });

  it("shows pending post with pending_approval status in the feed (author's own pending post)", async () => {
    const posts = [
      {
        id: PENDING_ID,
        authorId: VIEWER_ID,
        authorDisplayName: "Alice",
        authorPhotoUrl: null,
        content: "Pending post",
        contentType: "text",
        visibility: "group",
        groupId: GROUP_ID,
        isPinned: false,
        pinnedAt: null,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        category: "discussion",
        originalPostId: null,
        originalPost: null,
        status: "pending_approval",
        media: [],
        isBookmarked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { posts, nextCursor: null } }), { status: 200 }),
      );
    renderTab({}, fetchMock);
    await waitFor(() => {
      expect(screen.getByTestId("feed-item")).toBeInTheDocument();
    });
    expect(screen.getByTestId("feed-item")).toHaveAttribute("data-status", "pending_approval");
  });

  it("does NOT show 'Review Pending' button for non-leader non-moderated group", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { posts: [], nextCursor: null } }), { status: 200 }),
      );
    renderTab({ viewerRole: "member", isModerated: false }, fetchMock);
    await waitFor(() => {
      expect(screen.getByText("feed.empty")).toBeInTheDocument();
    });
    expect(screen.queryByText("feed.reviewPending")).not.toBeInTheDocument();
  });

  it("does NOT show 'Review Pending' button for leader in non-moderated group", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { posts: [], nextCursor: null } }), { status: 200 }),
      );
    renderTab({ viewerRole: "leader", isModerated: false }, fetchMock);
    await waitFor(() => {
      expect(screen.getByText("feed.empty")).toBeInTheDocument();
    });
    expect(screen.queryByText("feed.reviewPending")).not.toBeInTheDocument();
  });

  it("does NOT show 'Review Pending' button for member in moderated group", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { posts: [], nextCursor: null } }), { status: 200 }),
      );
    renderTab({ viewerRole: "member", isModerated: true }, fetchMock);
    await waitFor(() => {
      expect(screen.getByText("feed.empty")).toBeInTheDocument();
    });
    expect(screen.queryByText("feed.reviewPending")).not.toBeInTheDocument();
  });

  it("shows 'Review Pending' button for leader in moderated group", async () => {
    const pendingPosts = [
      {
        id: PENDING_ID,
        authorId: OTHER_USER_ID,
        authorDisplayName: "Bob",
        authorPhotoUrl: null,
        content: "Pending",
        contentType: "text",
        createdAt: new Date().toISOString(),
        media: [],
      },
    ];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse(pendingPosts);
      }
      return makeFeedResponse();
    });
    renderTab({ viewerRole: "leader", isModerated: true }, fetchMock);
    await waitFor(() => {
      expect(screen.getByText("feed.reviewPending")).toBeInTheDocument();
    });
  });

  it("shows 'Review Pending' button for creator in moderated group", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse([]);
      }
      return makeFeedResponse();
    });
    renderTab({ viewerRole: "creator", isModerated: true }, fetchMock);
    await waitFor(() => {
      expect(screen.getByText("feed.reviewPending")).toBeInTheDocument();
    });
  });

  it("expands pending panel when 'Review Pending' button is clicked and shows pending posts", async () => {
    const pendingPosts = [
      {
        id: PENDING_ID,
        authorId: OTHER_USER_ID,
        authorDisplayName: "Bob",
        authorPhotoUrl: null,
        content: "My pending content",
        contentType: "text",
        createdAt: new Date().toISOString(),
        media: [],
      },
    ];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse(pendingPosts);
      }
      return makeFeedResponse();
    });
    renderTab({ viewerRole: "leader", isModerated: true }, fetchMock);

    await waitFor(() => {
      expect(screen.getByText("feed.reviewPending")).toBeInTheDocument();
    });

    // Panel should not be visible yet
    expect(screen.queryByText("My pending content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("feed.reviewPending"));

    await waitFor(() => {
      expect(screen.getByText("My pending content")).toBeInTheDocument();
    });
    expect(screen.getByText("feed.approvePending")).toBeInTheDocument();
  });

  it("shows empty state in pending panel when no posts are pending", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse([]);
      }
      return makeFeedResponse();
    });
    renderTab({ viewerRole: "leader", isModerated: true }, fetchMock);

    await waitFor(() => {
      expect(screen.getByText("feed.reviewPending")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("feed.reviewPending"));

    await waitFor(() => {
      expect(screen.getByText("feed.noPendingPosts")).toBeInTheDocument();
    });
  });

  it("calls approve endpoint and refetches when Approve button is clicked", async () => {
    const pendingPosts = [
      {
        id: PENDING_ID,
        authorId: OTHER_USER_ID,
        authorDisplayName: "Bob",
        authorPhotoUrl: null,
        content: "Needs approval",
        contentType: "text",
        createdAt: new Date().toISOString(),
        media: [],
      },
    ];
    let approveCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes(`/posts/${PENDING_ID}/approve`)) {
        approveCallCount++;
        return Promise.resolve(new Response(JSON.stringify({ data: {} }), { status: 200 }));
      }
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse(approveCallCount > 0 ? [] : pendingPosts);
      }
      return makeFeedResponse();
    });
    renderTab({ viewerRole: "leader", isModerated: true }, fetchMock);

    await waitFor(() => {
      expect(screen.getByText("feed.reviewPending")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("feed.reviewPending"));

    await waitFor(() => {
      expect(screen.getByText("feed.approvePending")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("feed.approvePending"));

    await waitFor(() => {
      expect(approveCallCount).toBe(1);
    });
  });

  it("shows pending count badge when there are pending posts", async () => {
    const pendingPosts = [
      {
        id: PENDING_ID,
        authorId: OTHER_USER_ID,
        authorDisplayName: "Bob",
        authorPhotoUrl: null,
        content: "Pending 1",
        contentType: "text",
        createdAt: new Date().toISOString(),
        media: [],
      },
    ];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse(pendingPosts);
      }
      return makeFeedResponse();
    });
    renderTab({ viewerRole: "leader", isModerated: true }, fetchMock);

    await waitFor(() => {
      // The count badge should display the pending count
      expect(screen.getByText(/feed\.pendingCount/)).toBeInTheDocument();
    });
  });
});

describe("pending panel enriched content", () => {
  function makePendingPost(overrides = {}) {
    return {
      id: PENDING_ID,
      authorId: OTHER_USER_ID,
      authorDisplayName: "Bob Smith",
      authorPhotoUrl: null,
      content: "Check this out",
      contentType: "text",
      createdAt: new Date().toISOString(),
      media: [],
      ...overrides,
    };
  }

  async function openPendingPanel(fetchMock: typeof global.fetch) {
    renderTab({ viewerRole: "leader", isModerated: true }, fetchMock);
    await waitFor(() => expect(screen.getByText("feed.reviewPending")).toBeInTheDocument());
    fireEvent.click(screen.getByText("feed.reviewPending"));
  }

  it("shows author display name in pending card", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse([makePendingPost()]);
      }
      return makeFeedResponse();
    });
    await openPendingPanel(fetchMock);
    await waitFor(() => expect(screen.getByText("Bob Smith")).toBeInTheDocument());
  });

  it("links author name to profile page", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse([makePendingPost()]);
      }
      return makeFeedResponse();
    });
    await openPendingPanel(fetchMock);
    await waitFor(() => expect(screen.getByText("Bob Smith")).toBeInTheDocument());
    const links = screen.getAllByRole("link");
    const profileLinks = links.filter((l) =>
      l.getAttribute("href")?.includes(`/profiles/${OTHER_USER_ID}`),
    );
    expect(profileLinks.length).toBeGreaterThan(0);
  });

  it("shows image thumbnail when pending post has image media", async () => {
    const post = makePendingPost({
      media: [
        { id: "m1", mediaUrl: "https://cdn.example.com/img.jpg", mediaType: "image", sortOrder: 0 },
      ],
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse([post]);
      }
      return makeFeedResponse();
    });
    await openPendingPanel(fetchMock);
    await waitFor(() => {
      // img with alt="" has role="presentation", use querySelector to find by src
      const mediaImg = document.querySelector('img[src="https://cdn.example.com/img.jpg"]');
      expect(mediaImg).not.toBeNull();
    });
  });

  it("shows media type badge for non-image media", async () => {
    const post = makePendingPost({
      media: [
        {
          id: "m2",
          mediaUrl: "https://cdn.example.com/audio.mp3",
          mediaType: "audio",
          sortOrder: 0,
        },
      ],
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse([post]);
      }
      return makeFeedResponse();
    });
    await openPendingPanel(fetchMock);
    await waitFor(() => expect(screen.getByText("audio")).toBeInTheDocument());
  });

  it("shows Load More button when nextCursor is present", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true") && !url.includes("cursor=")) {
        return makePendingResponse([makePendingPost()], "2026-03-05T12:00:00.000Z");
      }
      return makeFeedResponse();
    });
    await openPendingPanel(fetchMock);
    await waitFor(() => expect(screen.getByText("feed.pendingLoadMore")).toBeInTheDocument());
  });

  it("does not show Load More when nextCursor is null", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        return makePendingResponse([makePendingPost()], null);
      }
      return makeFeedResponse();
    });
    await openPendingPanel(fetchMock);
    await waitFor(() => expect(screen.getByText("Bob Smith")).toBeInTheDocument());
    expect(screen.queryByText("feed.pendingLoadMore")).not.toBeInTheDocument();
  });

  it("fetches next page when Load More is clicked", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("pending=true")) {
        callCount++;
        if (callCount === 1) {
          return makePendingResponse([makePendingPost()], "2026-03-05T12:00:00.000Z");
        }
        return makePendingResponse([makePendingPost({ id: "pending-page-2" })], null);
      }
      return makeFeedResponse();
    });
    await openPendingPanel(fetchMock);
    await waitFor(() => expect(screen.getByText("feed.pendingLoadMore")).toBeInTheDocument());
    fireEvent.click(screen.getByText("feed.pendingLoadMore"));
    await waitFor(() => {
      const pendingCalls = fetchMock.mock.calls.filter(
        (c) => typeof c[0] === "string" && (c[0] as string).includes("pending=true"),
      );
      expect(pendingCalls.length).toBeGreaterThan(1);
      const secondCall = pendingCalls[1][0] as string;
      expect(secondCall).toContain("cursor=");
    });
  });
});
