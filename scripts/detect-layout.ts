// Prints detected layout rectangles for the pinned file. Usage: node scripts/detect-layout.ts
import { loadFixture } from '../test/fixture.ts';
import { detectLegend, refineFrame } from '../src/layout-detect.ts';
import { LAYOUT_SEEDS } from '../src/layout.ts';

const r = loadFixture();
for (const s of LAYOUT_SEEDS.insets) {
  console.log(s.id, 'frame', JSON.stringify(refineFrame(r, s.frame)), 'parent', JSON.stringify(refineFrame(r, s.parent, 4)));
}
console.log('legend', JSON.stringify(detectLegend(r, LAYOUT_SEEDS.legendWindow)));
