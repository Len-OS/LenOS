import { index, layout, route, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  layout("_workspace.tsx", [
    route("/channels", "_workspace.channels.tsx"),
    route("/channels/$channelId", "_workspace.channels.$channelId.tsx"),
    route("/messages", "_workspace.messages.tsx"),
    route("/messages/new", "_workspace.messages.new.tsx"),
    route("/messages/$channelId", "_workspace.messages.$channelId.tsx"),
    route("/repos", "_workspace.repos.tsx"),
  ]),
  route("/invite/$code", "invite.$code.tsx"),
  route("/repos/$repoId", "repos.$repoId.tsx"),
  route("/repos/$repoId/blob/$", "repos.$repoId.blob.$.tsx"),
]);
