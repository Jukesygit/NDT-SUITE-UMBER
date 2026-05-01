export async function verifyContentHash(
  body: ArrayBuffer,
  headers: Headers,
): Promise<{ verified: boolean; hash: string | null }> {
  const hashHeader = headers.get('X-Content-Hash');
  if (!hashHeader) {
    return { verified: false, hash: null };
  }

  const [algo, expectedHex] = hashHeader.split(':');
  if (algo !== 'sha256' || !expectedHex) {
    return { verified: false, hash: hashHeader };
  }

  const digest = await crypto.subtle.digest('SHA-256', body);
  const actualHex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    verified: actualHex === expectedHex,
    hash: hashHeader,
  };
}
