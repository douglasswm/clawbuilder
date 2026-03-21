import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/deploy')({
  component: DeployLayout,
});

function DeployLayout() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Deploy an Agent</h1>
      <p className="text-muted-foreground mb-6">Configure and deploy your OpenClaw agent to the cloud.</p>
      <Outlet />
    </div>
  );
}
