import { cn } from '@workspace/ui/lib/utils';

interface WizardNavProps {
  currentStep: 1 | 2;
}

const STEPS = [
  { label: 'Configure', step: 1 },
  { label: 'Review & Deploy', step: 2 },
];

export function WizardNav({ currentStep }: WizardNavProps) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {STEPS.map((s, i) => (
        <div key={s.step} className="flex items-center gap-2">
          {i > 0 && <div className="h-px w-8 bg-border" />}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
              currentStep === s.step
                ? 'bg-primary text-primary-foreground'
                : currentStep > s.step
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
            )}>
              {currentStep > s.step ? '\u2713' : s.step}
            </div>
            <span className={cn(
              'text-sm',
              currentStep === s.step ? 'font-medium' : 'text-muted-foreground'
            )}>
              {s.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
