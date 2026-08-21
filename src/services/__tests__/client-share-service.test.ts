// =============================================================================
// client-share-service — uploadShareBundle, the wire encoding half
// =============================================================================
// A publish of full-resolution thickness grids as raw JSON was refused outright
// by Supabase Storage (2026-08-21: "The object exceeded the maximum allowed
// size", the project's ~50MB upload cap). Gzip is what fixed it, and it lives
// here rather than in the builder because compression is async and is a property
// of the transfer, not of the bundle's content.
//
// So these tests pin the transfer: a file the builder marked `encoding: 'gzip'`
// arrives as gzip bytes that inflate BACK TO THE EXACT JSON — a bundle is the
// client's only copy, and a lossy compression step would be undetectable until
// someone opened the report — while everything else uploads exactly as before.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpload, mockStorageFrom, mockIsConfigured } = vi.hoisted(() => {
  const mockUpload = vi.fn(async () => ({ data: { path: 'ok' }, error: null }));
  return {
    mockUpload,
    mockStorageFrom: vi.fn(() => ({ upload: mockUpload })),
    mockIsConfigured: vi.fn(() => true),
  };
});

vi.mock('../../supabase-client', () => {
  const client = { storage: { from: mockStorageFrom } };
  return { default: client, supabase: client, isSupabaseConfigured: mockIsConfigured };
});

import { uploadShareBundle, type UploadBundleFile } from '../client-share-service';

// ---------------------------------------------------------------------------
// Blob reading. jsdom's Blob has only `slice`/`size`/`type` — no `text()`,
// `arrayBuffer()` or `stream()` — so the plain-JSON path (which builds a global
// Blob) has to be read through FileReader. The gzip path returns a Response-made
// Blob, which does carry `arrayBuffer()`; one helper covers both.
// ---------------------------------------------------------------------------

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  const maybe = blob as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof maybe.arrayBuffer === 'function') {
    return maybe.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

/** What the client's own inflate step would make of these bytes. */
async function inflate(bytes: Uint8Array): Promise<string> {
  const source = new Response(bytes as unknown as BodyInit).body;
  if (!source) throw new Error('no body to inflate');
  return new Response(source.pipeThrough(new DecompressionStream('gzip'))).text();
}

/** The body handed to storage for one uploaded path. */
function uploadedBody(path: string): Blob {
  const call = mockUpload.mock.calls.find((args) =>
    (args as unknown as [string])[0].endsWith(path)
  );
  if (!call) throw new Error(`nothing was uploaded to ${path}`);
  return (call as unknown as [string, Blob])[1];
}

function uploadedOptions(path: string): Record<string, unknown> {
  const call = mockUpload.mock.calls.find((args) =>
    (args as unknown as [string])[0].endsWith(path)
  );
  if (!call) throw new Error(`nothing was uploaded to ${path}`);
  return (call as unknown as [string, Blob, Record<string, unknown>])[2];
}

const MODEL_PATH = 'vessels/v-1/model.json.gz';
const BUNDLE_PATH = '11111111-1111-1111-1111-111111111111/rev-2';

/** A model-shaped payload: long Float64-ish decimals and a hole, like a grid. */
const MODEL_BODY = {
  version: 3,
  scanComposites: [
    {
      id: 'sc-1',
      data: [
        [12.7, 12.6999, null],
        [11.4, 11.4001, 12.7],
      ],
      xAxis: [0, 5, 10],
      stats: { min: 11.4, max: 12.7 },
    },
  ],
};

const modelFile = (): UploadBundleFile => ({
  path: MODEL_PATH,
  body: MODEL_BODY,
  contentType: 'application/gzip',
  encoding: 'gzip',
});

const manifestFile = (): UploadBundleFile => ({
  path: 'manifest.json',
  body: { formatVersion: 1, revision: 2, vessels: [] },
  contentType: 'application/json',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  mockUpload.mockResolvedValue({ data: { path: 'ok' }, error: null });
  mockStorageFrom.mockImplementation(() => ({ upload: mockUpload }));
});

describe('uploadShareBundle — gzip-encoded files', () => {
  it('uploads gzip bytes, not JSON text', async () => {
    await uploadShareBundle(BUNDLE_PATH, [modelFile()]);

    const bytes = await readBlobBytes(uploadedBody(MODEL_PATH));
    // The gzip magic number. Storage keeps bytes verbatim and the edge function
    // sends no `Content-Encoding`, so this header is what the viewer acts on.
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
  });

  it('inflates back to exactly the JSON the builder emitted', async () => {
    await uploadShareBundle(BUNDLE_PATH, [modelFile()]);

    const inflated = await inflate(await readBlobBytes(uploadedBody(MODEL_PATH)));
    // Character for character — the client parses this and gets the model the
    // builder assembled, holes and all. Nothing here may round or re-order.
    expect(inflated).toBe(JSON.stringify(MODEL_BODY));
    expect(JSON.parse(inflated)).toEqual(MODEL_BODY);
  });

  it('is smaller than the raw JSON — which is the entire point', async () => {
    // The incident this guards against: repetitive grid JSON at full resolution
    // blew the storage cap. Compression is not a nicety here.
    const raw = JSON.stringify(MODEL_BODY).length;
    await uploadShareBundle(BUNDLE_PATH, [modelFile()]);

    expect(uploadedBody(MODEL_PATH).size).toBeLessThan(raw);
  });

  it('keeps the declared content type on both the blob and the upload options', async () => {
    await uploadShareBundle(BUNDLE_PATH, [modelFile()]);

    expect(uploadedBody(MODEL_PATH).type).toBe('application/gzip');
    expect(uploadedOptions(MODEL_PATH)).toMatchObject({
      contentType: 'application/gzip',
      upsert: true,
    });
  });

  it('uploads under the bundle prefix, path unchanged', async () => {
    await uploadShareBundle(BUNDLE_PATH, [modelFile()]);
    expect(mockUpload).toHaveBeenCalledWith(
      `${BUNDLE_PATH}/${MODEL_PATH}`,
      expect.anything(),
      expect.anything()
    );
  });
});

describe('uploadShareBundle — everything else is unchanged', () => {
  it('uploads an unmarked JSON file as plain text', async () => {
    await uploadShareBundle(BUNDLE_PATH, [manifestFile()]);

    const bytes = await readBlobBytes(uploadedBody('manifest.json'));
    expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(manifestFile().body));
    expect(uploadedOptions('manifest.json')).toMatchObject({
      contentType: 'application/json',
      upsert: true,
    });
  });

  it('passes a Blob body through untouched — a PNG is not worth re-packing', async () => {
    const png = new Blob(['not really a png'], { type: 'image/png' });
    await uploadShareBundle(BUNDLE_PATH, [
      { path: 'vessels/v-1/screenshot.png', body: png, contentType: 'image/png' },
    ]);

    expect(uploadedBody('screenshot.png')).toBe(png);
  });

  it('still uploads the manifest LAST, whatever order it arrives in', async () => {
    await uploadShareBundle(BUNDLE_PATH, [manifestFile(), modelFile()]);

    const paths = mockUpload.mock.calls.map((args) => (args as unknown as [string])[0]);
    expect(paths).toEqual([`${BUNDLE_PATH}/${MODEL_PATH}`, `${BUNDLE_PATH}/manifest.json`]);
  });

  it('reports progress once per file', async () => {
    const progress = vi.fn();
    await uploadShareBundle(BUNDLE_PATH, [manifestFile(), modelFile()], progress);

    expect(progress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('throws on a storage error rather than continuing to the manifest', async () => {
    mockUpload.mockResolvedValueOnce({
      data: null,
      error: { message: 'The object exceeded the maximum allowed size' },
    } as never);

    await expect(
      uploadShareBundle(BUNDLE_PATH, [manifestFile(), modelFile()])
    ).rejects.toMatchObject({ message: 'The object exceeded the maximum allowed size' });
    // The manifest is the viewer's entry request: a failed revision must stay
    // unreadable rather than half-published.
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });
});
