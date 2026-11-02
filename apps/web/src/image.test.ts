import { afterEach, describe, expect, it, vi } from 'vitest';
import { POSTER_TYPES, checkPosterFile, fitWithin, shrinkPoster } from './image.js';

afterEach(() => vi.restoreAllMocks());

describe('checkPosterFile', () => {
  it.each(POSTER_TYPES)('accepts %s', (type) => {
    expect(checkPosterFile({ type, size: 1000 })).toBeNull();
  });

  it.each([
    ['an SVG, which can carry scripts', 'image/svg+xml'],
    ['a GIF', 'image/gif'],
    ['a PDF', 'application/pdf'],
    ['a file with no type', ''],
  ])('refuses %s', (_label, type) => {
    expect(checkPosterFile({ type, size: 1000 })).toBe('Choose a JPEG, PNG or WebP image');
  });

  it('refuses a file over 8 MB but accepts one just under', () => {
    expect(checkPosterFile({ type: 'image/png', size: 8 * 1024 * 1024 + 1 })).toBe(
      'Choose an image under 8 MB',
    );
    expect(checkPosterFile({ type: 'image/png', size: 8 * 1024 * 1024 })).toBeNull();
  });
});

describe('fitWithin', () => {
  it('scales a wide image down and keeps its shape', () => {
    expect(fitWithin(1200, 1800, 600)).toEqual({ width: 600, height: 900 });
    expect(fitWithin(4000, 3000, 600)).toEqual({ width: 600, height: 450 });
  });

  it('never scales an image up', () => {
    expect(fitWithin(300, 450, 600)).toEqual({ width: 300, height: 450 });
    expect(fitWithin(600, 900, 600)).toEqual({ width: 600, height: 900 });
  });

  it('keeps at least one pixel of height', () => {
    expect(fitWithin(6000, 2, 600).height).toBe(1);
  });
});

describe('shrinkPoster', () => {
  const stubBrowser = (opts: {
    width?: number;
    height?: number;
    sizeAt: (quality: number) => number;
    context?: unknown;
  }) => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: opts.width ?? 1200, height: opts.height ?? 1800, close }),
    );
    const context =
      opts.context === undefined ? { fillRect: vi.fn(), drawImage: vi.fn() } : opts.context;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const qualities: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, _type, quality) => {
      qualities.push(quality as number);
      done(new Blob([new Uint8Array(opts.sizeAt(quality as number))], { type: 'image/jpeg' }));
    });
    return {
      close,
      context: context as { fillRect: () => void; drawImage: () => void },
      qualities,
    };
  };

  it('draws a 600 px wide JPEG on white and releases the decoded image', async () => {
    const seen = stubBrowser({ sizeAt: () => 120_000 });
    const canvases: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = create(tag);
      if (tag === 'canvas') canvases.push(el as HTMLCanvasElement);
      return el;
    });

    const blob = await shrinkPoster(new Blob(['x'], { type: 'image/png' }));

    expect(blob.type).toBe('image/jpeg');
    expect(canvases[0]).toMatchObject({ width: 600, height: 900 });
    expect(seen.context.fillRect).toHaveBeenCalledWith(0, 0, 600, 900);
    expect(seen.context.drawImage).toHaveBeenCalledTimes(1);
    expect(seen.qualities).toEqual([0.85]);
    expect(seen.close).toHaveBeenCalled();
  });

  it('tries a lower quality when the first result is over 1 MB', async () => {
    const seen = stubBrowser({ sizeAt: (q) => (q > 0.8 ? 1_200_000 : 400_000) });

    const blob = await shrinkPoster(new Blob(['x']));

    expect(blob.size).toBe(400_000);
    expect(seen.qualities).toEqual([0.85, 0.7]);
  });

  it('gives up with a message when no quality gets under 1 MB', async () => {
    const seen = stubBrowser({ sizeAt: () => 2_000_000 });

    await expect(shrinkPoster(new Blob(['x']))).rejects.toThrow(
      'That image is too large, even after shrinking',
    );
    expect(seen.qualities).toEqual([0.85, 0.7, 0.5]);
    expect(seen.close).toHaveBeenCalled();
  });

  it('explains a file the browser cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad data')));

    await expect(shrinkPoster(new Blob(['x']))).rejects.toThrow('That image could not be read');
  });

  it('explains a browser with no 2D canvas', async () => {
    const seen = stubBrowser({ sizeAt: () => 1, context: null });

    await expect(shrinkPoster(new Blob(['x']))).rejects.toThrow(
      'This browser cannot prepare the image',
    );
    expect(seen.close).toHaveBeenCalled();
  });
});
