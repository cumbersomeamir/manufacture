import { SourcingWorkspace } from "./SourcingWorkspace";

export default async function ProjectSourcingPage({ params }) {
  const { id } = await params;
  return <SourcingWorkspace projectId={id} />;
}
