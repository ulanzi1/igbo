// @vitest-environment node
import { describe, it, expect, expectTypeOf } from "vitest";
import type { EventMap, EventName } from "./events";

describe("Event type definitions", () => {
  it("defines all required event names as string literals", () => {
    const eventNames: EventName[] = [
      "user.created",
      "post.published",
      "message.sent",
      "points.awarded",
      "member.banned",
      "member.approved",
      "member.followed",
      "member.unfollowed",
      "member.anonymizing",
      "member.anonymized",
      "post.reacted",
      "post.commented",
      "article.submitted",
      "article.published",
      "article.commented",
      "message.mentioned",
      "group.archived",
      "event.attended",
      "recording.expired",
      "job.failed",
    ];

    expect(eventNames).toHaveLength(20);
  });

  it("requires timestamp on all event payloads", () => {
    type AllPayloads = EventMap[EventName];
    expectTypeOf<AllPayloads>().toHaveProperty("timestamp");
  });

  it("exports EventMap type mapping event names to payload types", () => {
    expectTypeOf<EventMap>().toBeObject();
    expectTypeOf<EventMap["user.created"]>().toHaveProperty("userId");
    expectTypeOf<EventMap["post.published"]>().toHaveProperty("postId");
    expectTypeOf<EventMap["post.published"]>().toHaveProperty("authorId");
    expectTypeOf<EventMap["message.sent"]>().toHaveProperty("messageId");
    expectTypeOf<EventMap["points.awarded"]>().toHaveProperty("userId");
    expectTypeOf<EventMap["points.awarded"]>().toHaveProperty("points");
    expectTypeOf<EventMap["member.banned"]>().toHaveProperty("userId");
    expectTypeOf<EventMap["job.failed"]>().toHaveProperty("jobName");
    expectTypeOf<EventMap["job.failed"]>().toHaveProperty("error");
  });
});
