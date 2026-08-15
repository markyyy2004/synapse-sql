"use client";

import dynamic from "next/dynamic";

const ChatInterface = dynamic(() => import("./ChatInterface"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen bg-zinc-950 items-center justify-center text-zinc-500 text-sm">
      Loading SQL Agent...
    </div>
  ),
});

export default function Page() {
  return <ChatInterface />;
}