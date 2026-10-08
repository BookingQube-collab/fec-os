"use client";

import { Suspense } from "react";

import { ChatHub } from "@/components/chat/chat-hub";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatHub />
    </Suspense>
  );
}
