import { describe, it, expect } from 'vitest';
import { parseCompositeResponse } from '../companion-service';
import { mockBinaryCompositeBuffer } from '../../test/mocks/companion-handlers';

describe('parseCompositeResponse', () => {
  function buildMockResponse(width: number, height: number, overrides?: Record<string, string>): Response {
    const { buffer } = mockBinaryCompositeBuffer(width, height);

    const stats = {
      min: 15.0, max: 24.9, mean: 19.95, std: 2.87,
      validCount: 4286, totalCount: width * height, coveragePct: 85.72,
    };

    const headers = new Headers({
      'X-Matrix-Width': String(width),
      'X-Matrix-Height': String(height),
      'X-Matrix-Dtype': 'float32',
      'X-Stats': JSON.stringify(stats),
      'X-Source-Files': JSON.stringify([{ filename: 'test.nde', minX: 0, maxX: 10, minY: 0, maxY: 5 }]),
      'X-Warnings': JSON.stringify([]),
      ...overrides,
    });

    return new Response(buffer, { status: 200, headers });
  }

  it('parses a valid binary response', async () => {
    const width = 100;
    const height = 50;
    const response = buildMockResponse(width, height);

    const result = await parseCompositeResponse(response);

    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    expect(result.matrix).toBeInstanceOf(Float32Array);
    expect(result.matrix.length).toBe(width * height);
    expect(result.xAxis).toBeInstanceOf(Float32Array);
    expect(result.xAxis.length).toBe(width);
    expect(result.yAxis).toBeInstanceOf(Float32Array);
    expect(result.yAxis.length).toBe(height);
  });

  it('validates stats with zod', async () => {
    const response = buildMockResponse(10, 10);
    const result = await parseCompositeResponse(response);

    expect(result.stats.min).toBe(15.0);
    expect(result.stats.max).toBe(24.9);
    expect(result.stats.validCount).toBeTypeOf('number');
    expect(result.stats.coveragePct).toBeGreaterThanOrEqual(0);
    expect(result.stats.coveragePct).toBeLessThanOrEqual(100);
  });

  it('parses source files array', async () => {
    const response = buildMockResponse(10, 10);
    const result = await parseCompositeResponse(response);

    expect(result.sourceFiles).toHaveLength(1);
    expect(result.sourceFiles[0].filename).toBe('test.nde');
  });

  it('handles NaN values in matrix', async () => {
    const response = buildMockResponse(100, 50);
    const result = await parseCompositeResponse(response);

    // mockBinaryCompositeBuffer puts NaN every 7th element
    let nanCount = 0;
    for (let i = 0; i < result.matrix.length; i++) {
      if (isNaN(result.matrix[i])) nanCount++;
    }
    expect(nanCount).toBeGreaterThan(0);
  });

  it('throws on missing width header', async () => {
    const { buffer } = mockBinaryCompositeBuffer(10, 10);
    const response = new Response(buffer, {
      headers: { 'X-Matrix-Height': '10', 'X-Stats': '{}' },
    });

    await expect(parseCompositeResponse(response)).rejects.toThrow('Missing X-Matrix-Width');
  });

  it('throws on missing stats header', async () => {
    const { buffer } = mockBinaryCompositeBuffer(10, 10);
    const response = new Response(buffer, {
      headers: { 'X-Matrix-Width': '10', 'X-Matrix-Height': '10' },
    });

    await expect(parseCompositeResponse(response)).rejects.toThrow('Missing X-Stats');
  });

  it('throws on buffer size mismatch', async () => {
    const { buffer } = mockBinaryCompositeBuffer(10, 10);
    // Claim larger dimensions than actual buffer
    const response = new Response(buffer, {
      headers: {
        'X-Matrix-Width': '100',
        'X-Matrix-Height': '100',
        'X-Stats': JSON.stringify({
          min: 0, max: 0, mean: 0, std: 0,
          validCount: 0, totalCount: 10000, coveragePct: 0,
        }),
        'X-Source-Files': '[]',
        'X-Warnings': '[]',
      },
    });

    await expect(parseCompositeResponse(response)).rejects.toThrow('Binary payload size mismatch');
  });

  it('rejects invalid stats schema via zod', async () => {
    const { buffer } = mockBinaryCompositeBuffer(10, 10);
    const response = new Response(buffer, {
      headers: {
        'X-Matrix-Width': '10',
        'X-Matrix-Height': '10',
        'X-Stats': JSON.stringify({ min: 'not a number' }), // invalid
        'X-Source-Files': '[]',
        'X-Warnings': '[]',
      },
    });

    await expect(parseCompositeResponse(response)).rejects.toThrow();
  });

  it('handles empty warnings and source files', async () => {
    const response = buildMockResponse(10, 10, {
      'X-Source-Files': '[]',
      'X-Warnings': '[]',
    });
    const result = await parseCompositeResponse(response);

    expect(result.sourceFiles).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('creates correct typed array views from binary payload', async () => {
    const response = buildMockResponse(10, 5);
    const result = await parseCompositeResponse(response);

    // Axes are sliced into separate buffers for float32 alignment safety
    // (envelope data is uint8, which can break 4-byte alignment)
    expect(result.xAxis).toBeInstanceOf(Float32Array);
    expect(result.yAxis).toBeInstanceOf(Float32Array);
    expect(result.xAxis.length).toBe(10);
    expect(result.yAxis.length).toBe(5);
  });
});
