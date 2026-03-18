const SKILLS_API_BASE = 'https://clawmacdo-production.up.railway.app';
const FETCH_TIMEOUT_MS = 5_000;
const CATEGORIES_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

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

interface SkillsResult<T> {
  data: T;
  error?: string;
}

// Simple in-memory cache for categories
let categoriesCache: { data: Category[]; fetchedAt: number } | null = null;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getCategories(): Promise<SkillsResult<Category[]>> {
  if (categoriesCache && Date.now() - categoriesCache.fetchedAt < CATEGORIES_CACHE_TTL_MS) {
    return { data: categoriesCache.data };
  }
  try {
    const res = await fetchWithTimeout(`${SKILLS_API_BASE}/api/categories`, FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Category[];
    categoriesCache = { data, fetchedAt: Date.now() };
    return { data };
  } catch {
    return { data: [], error: 'Skills catalog temporarily unavailable' };
  }
}

export async function searchSkills(params: {
  query?: string;
  page?: number;
  limit?: number;
}): Promise<SkillsResult<Skill[]>> {
  const { query = '', page = 1, limit = 20 } = params;
  const url = new URL(`${SKILLS_API_BASE}/api/skills`);
  if (query) url.searchParams.set('q', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  try {
    const res = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Skill[];
    return { data };
  } catch {
    return { data: [], error: 'Skills catalog temporarily unavailable' };
  }
}

export async function getCategorySkills(params: {
  category: string;
  page?: number;
}): Promise<SkillsResult<Skill[]>> {
  const { category, page = 1 } = params;
  const url = new URL(`${SKILLS_API_BASE}/api/categories/${encodeURIComponent(category)}/files`);
  url.searchParams.set('page', String(page));
  try {
    const res = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Skill[];
    return { data };
  } catch {
    return { data: [], error: 'Skills catalog temporarily unavailable' };
  }
}
