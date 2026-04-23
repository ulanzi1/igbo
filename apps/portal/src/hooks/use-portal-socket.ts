"use client";

/**
 * Re-exports usePortalSocket from SocketProvider for cleaner imports.
 * Consumers import from here rather than directly from the provider.
 */
export { usePortalSocket } from "@/providers/SocketProvider";
