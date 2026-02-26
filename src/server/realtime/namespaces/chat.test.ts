// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { setupChatNamespace } from "./chat";
import type { Namespace, Socket } from "socket.io";

describe("setupChatNamespace", () => {
  it("registers a connection handler on the namespace", () => {
    const ns = {
      on: vi.fn(),
    } as unknown as Namespace;

    setupChatNamespace(ns);

    expect(ns.on).toHaveBeenCalledWith("connection", expect.any(Function));
  });

  it("does not throw when a client connects", () => {
    const connectionCallbacks: ((s: Socket) => void)[] = [];
    const ns = {
      on: vi.fn((_event: string, cb: (s: Socket) => void) => {
        connectionCallbacks.push(cb);
      }),
    } as unknown as Namespace;

    setupChatNamespace(ns);

    const socket = {} as Socket;
    expect(() => connectionCallbacks[0]?.(socket)).not.toThrow();
  });
});
