import { createFileRoute } from "@tanstack/react-router";
import { ForumPostDetail } from "@/features/forum/ui/ForumPostDetail";

function ForumPostDetailRoute() {
  const { channelId, postId } = Route.useParams();
  return <ForumPostDetail channelId={channelId} postId={postId} />;
}

export const Route = createFileRoute("/_workspace/channels/$channelId/posts/$postId")({
  component: ForumPostDetailRoute,
});
