import { ProjectWorkspace } from "./ProjectWorkspace";

export default async function ProjectPage({ params }) {
  const { id } = await params;
  return <ProjectWorkspace projectId={id} />;
}
