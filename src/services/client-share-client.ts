/**
 * Client-share fetch layer — the loginless half.
 *
 * Deliberately built on plain `fetch` and `import.meta.env`, with NO supabase-js
 * and NO auth import. The `/share/:token` page must ship a chunk whose module
 * graph contains no session handling at all: a logged-out client cannot be
 * asked to carry an auth client, and an auth client on a public page is an
 * invitation to accidentally use it (design "Client page", #13 chunk
 * separation). Keep this module dependency-free.
 *
 * Every response the edge function gives for a dead link — nonexistent, revoked,
 * expired — is byte-identical, so this layer cannot tell them apart either. It
 * reports one `unavailable` outcome and the UI says one thing. That is the
 * design, not a shortcut: distinguishing them here would leak what the edge
 * function refuses to.
 */

const FUNCTION_PATH = '/functions/v1/serve-client-share';

/** Why a fetch did not return a bundle file. */
export type ShareFetchFailure =
  | { kind: 'unavailable' }
  | { kind: 'passcode_required' }
  | { kind: 'passcode_invalid' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'network' };

export class ShareFetchError extends Error {
  readonly failure: ShareFetchFailure;

  constructor(failure: ShareFetchFailure) {
    super(failure.kind);
    this.name = 'ShareFetchError';
    this.failure = failure;
  }
}

function functionUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  return `${base}${FUNCTION_PATH}`;
}

/**
 * One request to the share function.
 *
 * The anon key rides along as `apikey` because the Supabase gateway expects one
 * even for a function deployed with JWT verification off; it is a public value
 * that is already in every bundle of this app, and it grants nothing here — the
 * function's own token check is the access control.
 */
async function request(token: string, passcode: string | null, path?: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(functionUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ token, passcode: passcode ?? undefined, path }),
    });
  } catch {
    // A transport failure is NOT a dead link; telling a client "this link no
    // longer works" because their wifi dropped would be actively misleading.
    throw new ShareFetchError({ kind: 'network' });
  }

  if (response.ok) return response;

  if (response.status === 401) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ShareFetchError({
      kind: body.error === 'passcode_invalid' ? 'passcode_invalid' : 'passcode_required',
    });
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? '60');
    throw new ShareFetchError({
      kind: 'rate_limited',
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 60,
    });
  }

  // 404 and anything else: one answer, no detail. See the module note.
  throw new ShareFetchError({ kind: 'unavailable' });
}

/** The manifest — the entry request, and the one that records a view. */
export async function fetchShareManifest(token: string, passcode: string | null): Promise<unknown> {
  const response = await request(token, passcode);
  return response.json();
}

/** One JSON file from the bundle (a vessel model). */
export async function fetchShareJson(
  token: string,
  passcode: string | null,
  path: string
): Promise<unknown> {
  const response = await request(token, passcode, path);
  return response.json();
}

/** One binary file from the bundle (a screenshot), as an object URL. */
export async function fetchShareBlobUrl(
  token: string,
  passcode: string | null,
  path: string
): Promise<string> {
  const response = await request(token, passcode, path);
  return URL.createObjectURL(await response.blob());
}
