import { createFileRoute, Outlet } from '@tanstack/react-router';
import { createContext, useContext, useState } from 'react';
import type { SelectedPersona } from '../../components/deploy-wizard/persona-picker';

export interface WizardState {
  name: string;
  region: string;
  size: string;
  primaryModel: string;
  persona: SelectedPersona | null;
}

export interface WizardContextValue {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used within WizardProvider');
  return ctx;
}

const DEFAULT_STATE: WizardState = {
  name: '',
  region: 'nyc1',
  size: 's-2vcpu-4gb',
  primaryModel: 'anthropic',
  persona: null,
};

export const Route = createFileRoute('/_authenticated/deploy')({
  component: DeployLayout,
});

function DeployLayout() {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);

  return (
    <WizardContext.Provider value={{ state, setState }}>
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">Deploy an Agent</h1>
        <p className="text-muted-foreground mb-6">Configure and deploy your OpenClaw agent to the cloud.</p>
        <Outlet />
      </div>
    </WizardContext.Provider>
  );
}
