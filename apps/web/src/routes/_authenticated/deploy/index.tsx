import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useWizard } from '../deploy';
import { Label } from '@workspace/ui/components/label';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Button } from '@workspace/ui/components/button';
import { REGIONS, SIZES, MODELS, validateDeploymentName } from '../../../lib/validation';
import { PersonaPicker } from '../../../components/deploy-wizard/persona-picker';
import { WizardNav } from '../../../components/deploy-wizard/wizard-nav';

export const Route = createFileRoute('/_authenticated/deploy/')({
  component: ConfigureStep,
});

function ConfigureStep() {
  const { state, setState } = useWizard();
  const navigate = useNavigate();
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleNext = () => {
    const validation = validateDeploymentName(state.name);
    if (!validation.valid) {
      setNameError(validation.error ?? 'Invalid name');
      return;
    }
    if (!state.region || !state.size || !state.primaryModel) {
      return;
    }
    navigate({ to: '/deploy/review' });
  };

  const isValid = !nameError && state.name && state.region && state.size && state.primaryModel;

  return (
    <div className="space-y-6">
      <WizardNav currentStep={1} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Deployment Name</Label>
          <Input
            id="name"
            placeholder="my-agent"
            value={state.name}
            onChange={(e) => {
              setState((s) => ({ ...s, name: e.target.value }));
              setNameError(null);
            }}
            onBlur={() => {
              const v = validateDeploymentName(state.name);
              setNameError(v.valid ? null : (v.error ?? 'Invalid'));
            }}
          />
          {nameError && <p className="text-sm text-red-600">{nameError}</p>}
          <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens. 3-63 characters.</p>
        </div>

        <div className="space-y-2">
          <Label>Region</Label>
          <Select value={state.region} onValueChange={(v) => setState((s) => ({ ...s, region: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Size</Label>
          <Select value={state.size} onValueChange={(v) => setState((s) => ({ ...s, size: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Primary AI Model</Label>
          <Select value={state.primaryModel} onValueChange={(v) => setState((s) => ({ ...s, primaryModel: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Persona (optional)</Label>
          {state.persona ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{state.persona.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setState((s) => ({ ...s, persona: null }))}
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPersonaPicker(true)}
            >
              Choose Persona
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!isValid}>
          Next: Review
        </Button>
      </div>

      <PersonaPicker
        open={showPersonaPicker}
        onOpenChange={setShowPersonaPicker}
        onSelect={(persona) => setState((s) => ({ ...s, persona }))}
      />
    </div>
  );
}
