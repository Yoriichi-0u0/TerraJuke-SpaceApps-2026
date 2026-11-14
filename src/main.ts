import './styles.css';
import { analyzePixels, computeCells, insetSummaries, regionStats } from './analyze.ts';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from './layout.ts';
import { extractRamp } from './legend.ts';
import { startUI } from './ui.ts';

/** Orange at the left end of the legend, purple at the right: proof the pixels are real. */
function legendLooksRight(ramp: ReturnType<typeof extractRamp>): boolean {
  if (ramp.length < 10) return false;
  const [r0, , b0] = ramp[0].rgb;
  const [, g1, b1] = ramp[ramp.length - 1].rgb;
  return r0 > b0 + 60 && b1 > g1 + 40;
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
    if (img.decode) await img.decode().catch(() => undefined);
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
    startUI({
      cells,
      insets: insetSummaries(field),
      ramp,
      overall: regionStats(field, { x0: 0, y0: 0, x1: IMAGE_WIDTH - 1, y1: IMAGE_HEIGHT - 1 }),
    });
    document.documentElement.dataset.ready = 'true';
  } catch (err) {
    status.textContent = `Could not analyse the NASA image: ${(err as Error).message}`;
  }
}

void boot();
