import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { parseLenOSPath } from "@/features/deep-links/deepLinkParser";
import { applyDeepLinkAction } from "@/features/deep-links/useDeepLinkHandler";
import { useProfilePanel } from "@/features/profiles/profile-panel-context";

export const Route = createFileRoute("/_workspace/lenos/$")({
  component: LenOSDeepLinkRoute,
});

function LenOSDeepLinkRoute() {
  const { _splat } = useParams({ from: "/_workspace/lenos/$" });
  const navigate = useNavigate();
  const { openProfile } = useProfilePanel();

  useEffect(() => {
    const action = parseLenOSPath(_splat ?? "");
    if (action) {
      applyDeepLinkAction(action, navigate, openProfile);
    } else {
      void navigate({ to: "/home" });
    }
  }, [_splat, navigate, openProfile]);

  return null;
}
