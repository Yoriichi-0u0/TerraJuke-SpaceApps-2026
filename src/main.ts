import './styles.css';
import { analyzePixels, computeCells, insetSummaries, regionStats } from './analyze.ts';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from './layout.ts';
import { analyzeYear, frameUrl, YEARS, type YearField } from './decade.ts';
import { extractRamp } from './legend.ts';
import { startUI } from './ui.ts';

/** Orange at the left end of the legend, purple at the right: proof the pixels are real. */
function legendLooksRight(ramp: ReturnType<typeof extractRamp>): boolean {
  if (ramp.length < 10) return false;
  const [r0, , b0] = ramp[0].rgb;
  const [, g1, b1] = ramp[ramp.length - 1].rgb;
  return r0 > b0 + 60 && b1 > g1 + 40;
}

/** img.decode(), but never waits more than 2 s: hidden or background pages may defer decoding. */
function decoded(img: HTMLImageElement): Promise<unknown> {
  return Promise.race([img.decode ? img.decode() : Promise.resolve(), new Promise((r) => setTimeout(r, 2000))]);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`${src} failed to load`));
    img.src = src;
  });
  await decoded(img).catch(() => undefined);
  return img;
}

/** NASA's twelve yearly frames, decoded and analysed in the browser. */
async function loadDecade(): Promise<YearField[]> {
  const images = await Promise.all(YEARS.map((y) => loadImage(frameUrl(y))));
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_WIDTH;
  canvas.height = IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return images.map((img, i) => {
    ctx.clearRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
    ctx.drawImage(img, 0, 0);
    return analyzeYear(ctx.getImageData(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT), YEARS[i]);
  });
}

async function boot(): Promise<void> {
  const img = document.getElementById('nasa-image') as HTMLImageElement;
  const status = document.getElementById('status')!;
  try {
    if (!img.complete || !img.naturalWidth) {
      await new Promise<void>((resolve, reject) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => reject(new Error('image failed to load')), { once: true });
      });
    }
    // A fully decoded image is required: some engines can otherwise paint a blank frame.
    await decoded(img).catch(() => undefined);
    let raster: ImageData | null = null;
    let ramp: ReturnType<typeof extractRamp> = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = IMAGE_WIDTH;
      canvas.height = IMAGE_HEIGHT;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      raster = ctx.getImageData(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
      ramp = extractRamp(raster);
      if (legendLooksRight(ramp)) break;
      raster = null;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!raster) throw new Error('the legend could not be read from the decoded image');
    const field = analyzePixels(raster, ramp);
    const cells = computeCells(field);
    const ui = startUI({
      cells,
      insets: insetSummaries(field),
      ramp,
      overall: regionStats(field, { x0: 0, y0: 0, x1: IMAGE_WIDTH - 1, y1: IMAGE_HEIGHT - 1 }),
    });
    document.documentElement.dataset.ready = 'true';
    // The decade loads after the change map is usable; the change map never waits for it.
    loadDecade()
      .then((fields) => {
        ui.enableDecade(fields);
        document.documentElement.dataset.decade = 'ready';
      })
      .catch((err: unknown) => {
        document.documentElement.dataset.decade = 'failed';
        status.textContent += ` NASA’s yearly frames could not be loaded (${(err as Error).message}); the change map still works.`;
      });
  } catch (err) {
    status.textContent = `Could not analyse the NASA image: ${(err as Error).message}`;
  }
}

void boot();
