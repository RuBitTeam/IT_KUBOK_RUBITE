import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/w/$wsId/")({
  component: () => {
    const { wsId } = Route.useParams();
    return <Navigate to="/w/$wsId/posts" params={{ wsId }} />;
  },
});
