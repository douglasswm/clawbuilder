import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRequest } from '@tanstack/react-start/server';
import { getSupabaseServerClient } from '../../src/lib/supabase.server';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: vi.fn().mockReturnValue(new Request('http://localhost/')),
}));

vi.mock('../../src/lib/supabase.server', () => ({
  getSupabaseServerClient: vi.fn(),
}));

import { getAuthenticatedClient } from '../../src/lib/server/auth-helpers';

const mockUser = { id: 'user-1', email: 'test@test.com' };
const mockHeaders = new Headers();

function setupAuthMock(user: unknown, error: unknown = null) {
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user }, error });
  vi.mocked(getRequest).mockReturnValue(new Request('http://localhost/'));
  vi.mocked(getSupabaseServerClient).mockReturnValue({
    supabase: { auth: { getUser: mockGetUser } } as unknown as ReturnType<typeof getSupabaseServerClient>['supabase'],
    headers: mockHeaders,
  });
}

describe('getAuthenticatedClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns supabase, user, and headers when authenticated', async () => {
    setupAuthMock(mockUser);
    const result = await getAuthenticatedClient();
    expect(result.user).toEqual(mockUser);
    expect(result.headers).toBe(mockHeaders);
    expect(result.supabase).toBeDefined();
  });

  it('throws a Response with status 401 when user is null', async () => {
    setupAuthMock(null);
    let thrown: unknown;
    try {
      await getAuthenticatedClient();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });

  it('throws a Response with status 401 when getUser returns an error', async () => {
    setupAuthMock(null, new Error('Auth error'));
    let thrown: unknown;
    try {
      await getAuthenticatedClient();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });
});
