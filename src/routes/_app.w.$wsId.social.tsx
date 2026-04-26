import { createFileRoute } from "@tanstack/react-router";
import { SocialPage } from "@/routes/_app.social";

export const Route = createFileRoute("/_app/w/$wsId/social")({
  component: SocialPage,
});
