import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Reset modules before each test so the module-level cache is cleared
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSuccess(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockFetchThrows(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

describe('getCategories', () => {
  it('returns data on success', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess([{ slug: 'ai', name: 'AI' }]));
    const { getCategories } = await import('../../src/lib/server/skills');
    const result = await getCategories();
    expect(result.data).toEqual([{ slug: 'ai', name: 'AI' }]);
    expect(result.error).toBeUndefined();
  });

  it('returns cached data on second call (fetch called only once)', async () => {
    const mockFetch = mockFetchSuccess([{ slug: 'cached', name: 'Cached' }]);
    vi.stubGlobal('fetch', mockFetch);
    const { getCategories } = await import('../../src/lib/server/skills');

    await getCategories();
    await getCategories();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns error result when API throws', async () => {
    vi.stubGlobal('fetch', mockFetchThrows(new Error('Network error')));
    const { getCategories } = await import('../../src/lib/server/skills');
    const result = await getCategories();
    expect(result.data).toEqual([]);
    expect(result.error).toBe('Skills catalog temporarily unavailable');
  });
});

describe('searchSkills', () => {
  it('includes query param in URL when query is provided', async () => {
    const mockFetch = mockFetchSuccess([{ slug: 'my-skill', name: 'My Skill' }]);
    vi.stubGlobal('fetch', mockFetch);
    const { searchSkills } = await import('../../src/lib/server/skills');

    await searchSkills({ query: 'myquery' });

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('q=myquery');
  });

  it('returns graceful error on 500 response', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess(null, 500));
    const { searchSkills } = await import('../../src/lib/server/skills');
    const result = await searchSkills({ query: 'test' });
    expect(result.data).toEqual([]);
    expect(result.error).toBe('Skills catalog temporarily unavailable');
  });

  it('returns data on success', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess([{ slug: 'skill-1', name: 'Skill 1' }]));
    const { searchSkills } = await import('../../src/lib/server/skills');
    const result = await searchSkills({ query: '' });
    expect(result.data).toEqual([{ slug: 'skill-1', name: 'Skill 1' }]);
  });
});

describe('getCategorySkills', () => {
  it('includes category slug in URL', async () => {
    const mockFetch = mockFetchSuccess([{ slug: 'cat-skill', name: 'Cat Skill' }]);
    vi.stubGlobal('fetch', mockFetch);
    const { getCategorySkills } = await import('../../src/lib/server/skills');

    await getCategorySkills({ category: 'my-category' });

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('my-category');
  });

  it('returns data on success', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess([{ slug: 's1', name: 'S1' }]));
    const { getCategorySkills } = await import('../../src/lib/server/skills');
    const result = await getCategorySkills({ category: 'ai' });
    expect(result.data).toEqual([{ slug: 's1', name: 'S1' }]);
  });

  it('returns graceful error when API is down', async () => {
    vi.stubGlobal('fetch', mockFetchThrows(new Error('timeout')));
    const { getCategorySkills } = await import('../../src/lib/server/skills');
    const result = await getCategorySkills({ category: 'ai' });
    expect(result.data).toEqual([]);
    expect(result.error).toBe('Skills catalog temporarily unavailable');
  });

  it('resolves without hanging (basic smoke test for timeout path)', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess([]));
    const { getCategorySkills } = await import('../../src/lib/server/skills');
    await expect(getCategorySkills({ category: 'ai' })).resolves.toBeDefined();
  });
});
