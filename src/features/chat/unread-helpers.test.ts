import { describe, expect, it } from "vitest";
import type { Tables } from "@/types/database";
import { isChatUnread, unreadChatsCount } from "./unread-helpers";

type Chat = Tables<"chats">;

function makeChat(overrides: Partial<Chat>): Chat {
  return {
    client_id: "client-1",
    created_at: "2026-05-12T10:00:00Z",
    id: "chat-1",
    last_message_at: null,
    last_message_text: null,
    last_read_client_at: null,
    last_read_master_at: null,
    master_id: "master-1",
    order_id: "order-1",
    ...overrides,
  };
}

describe("isChatUnread", () => {
  it("returns false when there are no messages yet", () => {
    const chat = makeChat({ last_message_at: null });
    expect(isChatUnread(chat, "client-1")).toBe(false);
  });

  it("returns true for the client when last_read_client_at is null", () => {
    const chat = makeChat({
      last_message_at: "2026-05-12T11:00:00Z",
      last_read_client_at: null,
    });
    expect(isChatUnread(chat, "client-1")).toBe(true);
  });

  it("returns true for the master when last_message_at > last_read_master_at", () => {
    const chat = makeChat({
      last_message_at: "2026-05-12T12:00:00Z",
      last_read_master_at: "2026-05-12T11:00:00Z",
    });
    expect(isChatUnread(chat, "master-1")).toBe(true);
  });

  it("returns false when participant has read past the last message", () => {
    const chat = makeChat({
      last_message_at: "2026-05-12T10:00:00Z",
      last_read_client_at: "2026-05-12T11:00:00Z",
    });
    expect(isChatUnread(chat, "client-1")).toBe(false);
  });

  it("uses the role-appropriate read marker for each user", () => {
    const chat = makeChat({
      last_message_at: "2026-05-12T12:00:00Z",
      last_read_client_at: "2026-05-12T13:00:00Z",
      last_read_master_at: "2026-05-12T11:00:00Z",
    });
    expect(isChatUnread(chat, "client-1")).toBe(false); // client прочитал позже
    expect(isChatUnread(chat, "master-1")).toBe(true); // master ещё нет
  });
});

describe("unreadChatsCount", () => {
  it("returns 0 for null/undefined inputs", () => {
    expect(unreadChatsCount(undefined, "client-1")).toBe(0);
    expect(unreadChatsCount([], undefined)).toBe(0);
  });

  it("counts only chats that are unread for the given user", () => {
    const chats: Chat[] = [
      makeChat({ id: "a", last_message_at: "2026-05-12T11:00:00Z" }), // unread
      makeChat({
        id: "b",
        last_message_at: "2026-05-12T10:00:00Z",
        last_read_client_at: "2026-05-12T11:00:00Z",
      }), // read
      makeChat({
        id: "c",
        last_message_at: "2026-05-12T12:00:00Z",
        last_read_client_at: "2026-05-12T11:00:00Z",
      }), // unread
    ];
    expect(unreadChatsCount(chats, "client-1")).toBe(2);
  });
});
