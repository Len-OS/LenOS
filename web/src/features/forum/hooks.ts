import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_FORUM_POST, KIND_FORUM_COMMENT } from "@/shared/constants/kinds";

export interface ForumPost {
  id: string;
  pubkey: string;
  subject: string;
  content: string;
  createdAt: number;
  replyCount: number;
}

export interface ForumReply {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

export function useForumPosts(channelId: string): {
  posts: ForumPost[];
  isLoading: boolean;
} {
  const [posts, setPosts] = useState<Map<string, ForumPost>>(new Map());
  const [replyCounts, setReplyCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    setIsLoading(true);
    const client = getRelayClient(relayWsUrl());

    const unsubPosts = client.subscribe({
      id: `forum-posts-${channelId}`,
      filter: { kinds: [KIND_FORUM_POST], "#h": [channelId], limit: 200 },
      onEvent: (raw) => {
        setIsLoading(false);
        const tags = (raw.tags as string[][]) ?? [];
        const subject = tags.find((t) => t[0] === "subject")?.[1] ?? "";
        const post: ForumPost = {
          id: raw.id as string,
          pubkey: raw.pubkey as string,
          subject,
          content: raw.content as string,
          createdAt: raw.created_at as number,
          replyCount: 0,
        };
        setPosts((prev) => {
          const next = new Map(prev);
          next.set(post.id, post);
          return next;
        });
      },
    });

    const unsubReplies = client.subscribe({
      id: `forum-replies-count-${channelId}`,
      filter: { kinds: [KIND_FORUM_COMMENT], "#h": [channelId], limit: 500 },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const parentId = tags.find((t) => t[0] === "e")?.[1];
        if (!parentId) return;
        setReplyCounts((prev) => {
          const next = new Map(prev);
          next.set(parentId, (next.get(parentId) ?? 0) + 1);
          return next;
        });
      },
    });

    const timer = setTimeout(() => setIsLoading(false), 3000);

    return () => {
      unsubPosts();
      unsubReplies();
      clearTimeout(timer);
      setPosts(new Map());
      setReplyCounts(new Map());
    };
  }, [channelId]);

  const sortedPosts = Array.from(posts.values())
    .map((p) => ({ ...p, replyCount: replyCounts.get(p.id) ?? 0 }))
    .sort((a, b) => b.createdAt - a.createdAt);

  return { posts: sortedPosts, isLoading };
}

export function useForumThread(channelId: string, postId: string | null) {
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!channelId || !postId) {
      setPost(null);
      setReplies([]);
      return;
    }
    setIsLoading(true);
    const client = getRelayClient(relayWsUrl());

    const unsubPost = client.subscribe({
      id: `forum-post-${postId}`,
      filter: { kinds: [KIND_FORUM_POST], ids: [postId] },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const subject = tags.find((t) => t[0] === "subject")?.[1] ?? "";
        setPost({
          id: raw.id as string,
          pubkey: raw.pubkey as string,
          subject,
          content: raw.content as string,
          createdAt: raw.created_at as number,
          replyCount: 0,
        });
        setIsLoading(false);
      },
    });

    const unsubReplies = client.subscribe({
      id: `forum-thread-${postId}`,
      filter: {
        kinds: [KIND_FORUM_COMMENT],
        "#e": [postId],
        "#h": [channelId],
        limit: 200,
      },
      onEvent: (raw) => {
        const reply: ForumReply = {
          id: raw.id as string,
          pubkey: raw.pubkey as string,
          content: raw.content as string,
          createdAt: raw.created_at as number,
        };
        setReplies((prev) => {
          if (prev.some((r) => r.id === reply.id)) return prev;
          return [...prev, reply].sort((a, b) => a.createdAt - b.createdAt);
        });
      },
    });

    return () => {
      unsubPost();
      unsubReplies();
    };
  }, [channelId, postId]);

  return { post, replies, isLoading };
}
