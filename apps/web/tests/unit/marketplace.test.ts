import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: vi.fn().mockReturnValue(new Request('http://localhost/')),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (fn: Function) => ({
      handler: (handlerFn: Function) => {
        // Store the handler so we can call it directly in tests
        const wrapper = (input: unknown) => handlerFn({ data: fn(input) });
        wrapper.__handler = handlerFn;
        wrapper.__inputValidator = fn;
        return wrapper;
      },
    }),
  }),
}));

// Build a chainable mock query builder
function createQueryBuilder(result: { data: unknown; count?: number | null; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ['select', 'eq', 'or', 'order', 'range', 'ilike', 'maybeSingle'];

  for (const method of chainMethods) {
    if (method === 'range') {
      builder[method] = vi.fn().mockResolvedValue(result);
    } else if (method === 'maybeSingle') {
      builder[method] = vi.fn().mockResolvedValue(result);
    } else {
      builder[method] = vi.fn().mockReturnValue(builder);
    }
  }

  return builder;
}

let mockQueryBuilder: ReturnType<typeof createQueryBuilder>;

vi.mock('../../src/lib/supabase.server', () => ({
  getSupabaseServerClient: vi.fn(() => ({
    supabase: {
      from: vi.fn(() => mockQueryBuilder),
    },
    headers: new Headers(),
  })),
}));

// Import after mocks are set up
import {
  listMarketplaceTemplates,
  getMarketplaceTemplateBySlug,
} from '../../src/lib/server/marketplace';

const sampleTemplate = {
  id: 't-1',
  name: 'Test Template',
  slug: 'test-template',
  description: 'A test template',
  category: 'chatbot',
  providers: ['openai', 'anthropic'],
  provider_snapshots: null,
  thumbnail_url: 'https://example.com/thumb.png',
  deploy_count: 42,
  created_at: '2026-01-01T00:00:00Z',
};

// agent_templates row shape (used by getMarketplaceTemplateBySlug which queries agent_templates directly)
const sampleAgentTemplate = {
  id: 't-1',
  name: 'Test Template',
  slug: 'test-template',
  description: 'A test template',
  category: 'chatbot',
  provider_snapshots: { openai: 'snap-openai', anthropic: 'snap-anthropic' },
  thumbnail_url: 'https://example.com/thumb.png',
  deploy_count: 42,
  created_at: '2026-01-01T00:00:00Z',
};

describe('listMarketplaceTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated templates', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: [sampleTemplate],
      count: 1,
      error: null,
    });

    const result = await (listMarketplaceTemplates as Function)({});
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(sampleTemplate);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('applies search query filter', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: [sampleTemplate],
      count: 1,
      error: null,
    });

    await (listMarketplaceTemplates as Function)({ query: 'test' });
    expect(mockQueryBuilder.or).toHaveBeenCalledWith(
      'name.ilike.%test%,description.ilike.%test%',
    );
  });

  it('applies category filter', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: [sampleTemplate],
      count: 1,
      error: null,
    });

    await (listMarketplaceTemplates as Function)({ category: 'chatbot' });
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('category', 'chatbot');
  });

  it('handles pagination offset correctly', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: [],
      count: 0,
      error: null,
    });

    await (listMarketplaceTemplates as Function)({ page: 3 });
    // page 3 => from=40, to=59
    expect(mockQueryBuilder.range).toHaveBeenCalledWith(40, 59);
  });

  it('returns empty results gracefully', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: [],
      count: 0,
      error: null,
    });

    const result = await (listMarketplaceTemplates as Function)({});
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('throws on Supabase error', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: null,
      count: null,
      error: { message: 'DB error' },
    });

    await expect((listMarketplaceTemplates as Function)({})).rejects.toThrow(
      'DB error',
    );
  });
});

describe('getMarketplaceTemplateBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a template for a valid slug', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: sampleAgentTemplate,
      error: null,
    });

    const result = await (getMarketplaceTemplateBySlug as Function)({
      slug: 'test-template',
    });
    expect(result).toEqual({
      ...sampleAgentTemplate,
      providers: ['openai', 'anthropic'],
      provider_snapshots: { openai: 'snap-openai', anthropic: 'snap-anthropic' },
    });
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('slug', 'test-template');
    expect(mockQueryBuilder.maybeSingle).toHaveBeenCalled();
  });

  it('returns null for an invalid slug', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: null,
      error: null,
    });

    const result = await (getMarketplaceTemplateBySlug as Function)({
      slug: 'nonexistent',
    });
    expect(result).toBeNull();
  });

  it('throws on Supabase error', async () => {
    mockQueryBuilder = createQueryBuilder({
      data: null,
      error: { message: 'Not found error' },
    });

    await expect(
      (getMarketplaceTemplateBySlug as Function)({ slug: 'bad' }),
    ).rejects.toThrow('Not found error');
  });
});
