"use client";

import { useParams } from "next/navigation";
import { ChatWindow } from "@/features/chat/components/ChatWindow";

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params?.conversationId ?? "";

  if (!conversationId) return null;

  return <ChatWindow conversationId={conversationId} />;
}
