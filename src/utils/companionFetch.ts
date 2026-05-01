let _token: string | null = null;

export function setCompanionToken(token: string | null): void {
  _token = token;
}

export function getCompanionToken(): string | null {
  return _token;
}

export async function companionFetch(
  port: number,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (_token) {
    headers.set('Authorization', `Bearer ${_token}`);
  }

  const res = await fetch(`http://localhost:${port}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 401 && _token) {
    // Token expired or invalid — try to re-acquire from /status
    const statusRes = await fetch(`http://localhost:${port}/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (statusRes.ok) {
      const status = await statusRes.json();
      if (status.token) {
        _token = status.token;
        headers.set('Authorization', `Bearer ${_token}`);
        return fetch(`http://localhost:${port}${path}`, { ...init, headers });
      }
    }
  }

  return res;
}
