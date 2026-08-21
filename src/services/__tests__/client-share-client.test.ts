// =============================================================================
// client-share-client — fetchShareJson and the .gz branch
// =============================================================================
// Vessel models are stored gzipped (raw full-resolution grids exceeded Storage's
// upload cap, 2026-08-21) and the edge function proxies stored bytes verbatim,
// with no `Content-Encoding` header — so nothing inflates them for us. The
// viewer does it, keyed off the `.gz` in the path the MANIFEST names.
//
// That is deliberately not a format-version check, and this file is where that
// choice is pinned: a bundle published before compression still names a plain
// `model.json`, and it must keep loading on a viewer that can inflate.
//
// `DecompressionStream` is browser-native. This module must stay dependency-free
// — the `/share/:token` chunk carries no auth and no library it can avoid — so a
// compression library here would be a chunk-guard failure, not just weight.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ShareFetchError, fetchShareJson } from '../client-share-client';

const MODEL = {
  version: 3,
  scanComposites: [{ id: 'sc-1', data: [[12.7, null, 11.4]], xAxis: [0, 5, 10] }],
};

async function gzipBytes(text: string): Promise<Uint8Array> {
  const source = new Response(text).body;
  if (!source) throw new Error('no body to compress');
  const compressed = source.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The body the client POSTed, parsed — the function takes its path from here. */
function requestedBody(): Record<string, unknown> {
  const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('fetchShareJson — gzipped models', () => {
  it('inflates a .gz payload and parses it', async () => {
    const bytes = await gzipBytes(JSON.stringify(MODEL));
    mockFetch.mockResolvedValue(new Response(bytes as unknown as BodyInit, { status: 200 }));

    const parsed = await fetchShareJson('tok', null, 'vessels/v-1/model.json.gz');

    // Cell for cell, hole included: this is the client's only copy.
    expect(parsed).toEqual(MODEL);
  });

  it('asks for the path the manifest named, unchanged', async () => {
    mockFetch.mockResolvedValue(
      new Response((await gzipBytes('{}')) as unknown as BodyInit, { status: 200 })
    );
    await fetchShareJson('tok', 'hunter2', 'vessels/v-1/model.json.gz');

    expect(requestedBody()).toMatchObject({
      token: 'tok',
      passcode: 'hunter2',
      path: 'vessels/v-1/model.json.gz',
    });
  });

  it('falls back to the buffered body when the response exposes no stream', async () => {
    // `Response.body` is nullable by spec. Buffering the blob and re-wrapping it
    // yields the same bytes without reaching for `Blob.stream()`.
    const bytes = await gzipBytes(JSON.stringify(MODEL));
    const blob = await new Response(bytes as unknown as BodyInit).blob();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      blob: async () => blob,
    } as unknown as Response);

    expect(await fetchShareJson('tok', null, 'vessels/v-1/model.json.gz')).toEqual(MODEL);
  });

  it('surfaces a truncated or non-gzip payload as a failure, not as silence', async () => {
    mockFetch.mockResolvedValue(new Response('this is not gzip', { status: 200 }));

    await expect(fetchShareJson('tok', null, 'vessels/v-1/model.json.gz')).rejects.toThrow();
  });
});

describe('fetchShareJson — plain JSON still works', () => {
  it('parses a .json path without inflating it', async () => {
    // A bundle published before compression names `model.json`. There is no
    // format-version gate, so this is the only thing keeping that link alive.
    mockFetch.mockResolvedValue(new Response(JSON.stringify(MODEL), { status: 200 }));

    expect(await fetchShareJson('tok', null, 'vessels/v-1/model.json')).toEqual(MODEL);
  });

  it('still reports a dead link as one answer, whatever the path', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 404 }));

    await expect(fetchShareJson('tok', null, 'vessels/v-1/model.json.gz')).rejects.toBeInstanceOf(
      ShareFetchError
    );
    await expect(fetchShareJson('tok', null, 'vessels/v-1/model.json.gz')).rejects.toMatchObject({
      failure: { kind: 'unavailable' },
    });
  });

  it('reports a transport failure as network, never as a dead link', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchShareJson('tok', null, 'vessels/v-1/model.json.gz')).rejects.toMatchObject({
      failure: { kind: 'network' },
    });
  });
});
