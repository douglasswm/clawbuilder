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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (persona: SelectedPersona) => void;
  disabled?: boolean;
}

export function PersonaPicker({ open, onOpenChange, onSelect, disabled }: PersonaPickerProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load categories once when dialog opens
  useEffect(() => {
    if (!open) return;
    fetchCategories()
      .then((result) => {
        setCategories(result.data ?? []);
      })
      .catch(() => {});
  }, [open]);

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
            setSkills(result.data ?? []);
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
    if (!open) return;
    loadSkills(query, activeCategory);
  }, [open, query, activeCategory, loadSkills]);

  const handleSelect = (skill: Skill) => {
    if (disabled || loading) return;
    onSelect({ slug: skill.slug, name: skill.name, category: skill.category });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose a Persona</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search personas..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mt-2"
        />

        <Tabs
          value={activeCategory}
          onValueChange={setActiveCategory}
          className="flex-1 flex flex-col min-h-0 mt-4"
        >
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map((cat) => (
              <TabsTrigger key={cat.slug} value={cat.slug}>
                {cat.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
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
                    className="text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      </DialogContent>
    </Dialog>
  );
}
