"use client";

import { createContext, useContext } from "react";

export interface NotificationCountValue {
  unreadCount: number;
  increment: () => void;
  decrement: () => void;
  resetUnreadCount: () => void;
  syncFromServer: () => void;
}

export const NotificationCountContext = createContext<NotificationCountValue>({
  unreadCount: 0,
  increment: () => {},
  decrement: () => {},
  resetUnreadCount: () => {},
  syncFromServer: () => {},
});

export function useNotificationCount(): NotificationCountValue {
  return useContext(NotificationCountContext);
}
