import { index, layout, route, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  layout("_workspace.tsx", [
    route("/channels", "_workspace.channels.tsx"),
    route("/channels/$channelId", "_workspace.channels.$channelId.tsx"),
    route(
      "/channels/$channelId/posts/$postId",
      "_workspace.channels.$channelId.posts.$postId.tsx",
    ),
    route("/messages", "_workspace.messages.tsx"),
    route("/messages/new", "_workspace.messages.new.tsx"),
    route("/messages/$channelId", "_workspace.messages.$channelId.tsx"),
    route("/repos", "_workspace.repos.tsx"),
    route("/repos/$repoId", "_workspace.repos.$repoId.tsx"),
    route("/repos/$repoId/blob/$", "_workspace.repos.$repoId.blob.$.tsx"),
    route("/workflows", "_workspace.workflows.tsx"),
    route("/home", "_workspace.home.tsx"),
    route("/reminders", "_workspace.reminders.tsx"),
    route("/pulse", "_workspace.pulse.tsx"),
    route("/agents", "_workspace.agents.tsx"),
    route("/drafts", "_workspace.drafts.tsx", [
      index("_workspace.drafts.index.tsx"),
      route("/scheduled", "_workspace.drafts.scheduled.tsx"),
    ]),
    route("/saved", "_workspace.saved.tsx"),
    route("/people", "_workspace.people.tsx"),
    route("/lenos/$", "_workspace.lenos.$.tsx"),
  ]),
  route("/invite/$code", "invite.$code.tsx"),
]);
