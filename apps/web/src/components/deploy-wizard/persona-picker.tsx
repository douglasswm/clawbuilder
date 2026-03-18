import { useState, useEffect, useCallback, useRef } from 'react';
import { createServerFn } from '@tanstack/react-start';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Input } from '@workspace/ui/components/input';
import { Tabs, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Badge } from '@workspace/ui/components/badge';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Button } from '@workspace/ui/components/button';

interface Category {
  slug: string;
  name: string;
  description?: string;
}

interface Skill {
  slug: string;
  name: string;
  description?: string;
  category?: string;
}

export interface SelectedPersona {
  slug: string;
  name: string;
  category?: string;
}

interface FetchSkillsInput {
  query?: string;
  category?: string;
  page?: number;
}

// Server functions that proxy the skills catalog
const fetchCategories = createServerFn().handler(async () => {
  const { getCategories } = await import('../../lib/server/skills');
  return getCategories();
});

const fetchSkills = createServerFn({ method: 'POST' })
  .inputValidator((data: FetchSkillsInput) => data)
  .handler(async (ctx) => {
    const { searchSkills, getCategorySkills } = await import('../../lib/server/skills');
    const { query, category, page } = ctx.data;
    if (category && category !== 'all') {
      return getCategorySkills({ category, page });
    }
    return searchSkills({ query, page });
  });

interface PersonaPickerProps {
  mode?: 'inline' | 'dialog';
  selectedSlug?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect: (persona: SelectedPersona | null) => void;
  disabled?: boolean;
}

export function PersonaPicker({
  mode = 'dialog',
  selectedSlug,
  open,
  onOpenChange,
  onSelect,
  disabled,
}: PersonaPickerProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = mode === 'inline' ? true : !!open;

  // Load categories once when active
  useEffect(() => {
    if (!isActive) return;
    fetchCategories()
      .then((result) => {
        const data = result.data;
        setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, [isActive]);

  // Load skills with debounce on query/category changes
  const loadSkills = useCallback(
    (q: string, category: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        setError(null);
        try {
          const result = await fetchSkills({ data: { query: q, category, page: 1 } as FetchSkillsInput });
          if (result.error) {
            setError(result.error);
            setSkills([]);
          } else {
            const data = result.data;
            setSkills(Array.isArray(data) ? data : []);
          }
        } catch {
          setError('Skills catalog temporarily unavailable');
          setSkills([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [],
  );

  useEffect(() => {
    if (!isActive) return;
    loadSkills(query, activeCategory);
  }, [isActive, query, activeCategory, loadSkills]);

  const handleSelect = (skill: Skill) => {
    if (disabled || loading) return;
    onSelect({ slug: skill.slug, name: skill.name, category: skill.category });
    if (mode === 'dialog') onOpenChange?.(false);
  };

  const selectedSkill = selectedSlug ? skills.find((s) => s.slug === selectedSlug) : null;

  const content = (
    <div className={mode === 'inline' ? 'space-y-4' : ''}>
      {/* Selected persona card (inline mode only) */}
      {mode === 'inline' && selectedSkill && (
        <div className="rounded-lg border-2 border-primary bg-accent/50 p-4 flex items-start justify-between transition-all animate-in fade-in slide-in-from-top-1 duration-200">
          <div>
            <div className="font-medium">{selectedSkill.name}</div>
            {selectedSkill.description && (
              <div className="text-sm text-muted-foreground mt-1">{selectedSkill.description}</div>
            )}
            {selectedSkill.category && (
              <Badge variant="secondary" className="mt-2 text-xs">{selectedSkill.category}</Badge>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect(null)}
          >
            Change
          </Button>
        </div>
      )}

      {/* Selected slug but skill not loaded yet (inline mode) */}
      {mode === 'inline' && selectedSlug && !selectedSkill && !loading && (
        <div className="rounded-lg border-2 border-primary bg-accent/50 p-4 flex items-center justify-between">
          <span className="font-medium font-mono text-sm">{selectedSlug}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
            Change
          </Button>
        </div>
      )}

      <Input
        placeholder="Search personas..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={mode === 'dialog' ? 'mt-2' : ''}
      />

      <Tabs
        value={activeCategory}
        onValueChange={setActiveCategory}
        className={mode === 'dialog' ? 'flex-1 flex flex-col min-h-0 mt-4' : 'mt-4'}
      >
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          {categories.map((cat) => (
            <TabsTrigger key={cat.slug} value={cat.slug}>
              {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className={mode === 'dialog' ? 'flex-1 overflow-y-auto mt-4' : 'mt-4'}>
          {error && (
            <div className="text-center text-muted-foreground py-8">{error}</div>
          )}

          {loading && !error && (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          )}

          {!loading && !error && skills.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No personas found</div>
          )}

          {!loading && !error && skills.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {skills.map((skill) => (
                <button
                  key={skill.slug}
                  type="button"
                  onClick={() => handleSelect(skill)}
                  disabled={disabled || loading}
                  className={`text-left p-3 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedSlug === skill.slug
                      ? 'border-primary bg-accent ring-1 ring-primary/20'
                      : 'border-border hover:border-primary hover:bg-accent'
                  }`}
                >
                  <div className="font-medium text-sm">{skill.name}</div>
                  {skill.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {skill.description}
                    </div>
                  )}
                  {skill.category && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {skill.category}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </Tabs>

      {/* Deploy without persona link (inline mode only) */}
      {mode === 'inline' && selectedSlug && (
        <div className="text-center pt-2">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            onClick={() => onSelect(null)}
          >
            Deploy without a persona
          </button>
        </div>
      )}
    </div>
  );

  if (mode === 'inline') return content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose a Persona</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
