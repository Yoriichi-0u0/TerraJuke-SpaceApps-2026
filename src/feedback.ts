// One FeedbackEvent drives every channel at the same moment: sound, a visual pulse,
// a visible caption, optional screen-reader text and optional vibration.
import type { Direction } from './analyze.ts';
import type { AudioEngine } from './audio.ts';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from './layout.ts';
import type { Rect } from './raster.ts';
import { EVENT_SECONDS, type NotePlan } from './sonify.ts';

export type Announcements = 'off' | 'selection' | 'summary';

export interface FeedbackEvent {
  readonly id: number;
  readonly source: 'cell' | 'region' | 'legend' | 'year';
  /** 'user' for a direct selection; 'auto' for tour and legend steps. */
  readonly origin: 'user' | 'auto';
  readonly rect: Rect;
  readonly direction: Direction;
  /** |mean legend position| 0–1: how far along NASA's legend, not a measured amount. */
  readonly magnitude: number;
  readonly litFraction: number;
  readonly plan: NotePlan;
  /** Concise caption, e.g. "India map region · more light · 3% of map pixels lit · rising". */
  readonly text: string;
}

export const VIBRATION_PATTERNS: Record<Direction, number[]> = {
  more: [30, 40, 30],
  less: [120],
  steady: [15],
};

export interface ChannelRecord {
  id: number;
  direction: Direction;
  figure: string;
  audioAt: number | null;
  pulseAt: number;
  captionAt: number;
  announcedAt: number | null;
  vibratedAt: number | null;
  text: string;
}

declare global {
  interface Window {
    /** Last feedback events and when each channel fired (for tests and diagnostics). */
    terrajukeLog?: ChannelRecord[];
  }
}

export class Announcer {
  private timer: number | undefined;
  private readonly el: HTMLElement;
  constructor(el: HTMLElement) {
    this.el = el;
  }
  say(text: string): void {
    window.clearTimeout(this.timer);
    this.el.textContent = '';
    // A short gap makes screen readers treat a repeated message as new.
    this.timer = window.setTimeout(() => {
      this.el.textContent = text;
    }, 60);
  }
}

export function vibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export interface FeedbackOptions {
  audio: AudioEngine;
  pulseLayer: HTMLElement;
  caption: HTMLElement;
  announcer: Announcer;
}

export class Feedback {
  announcements: Announcements = 'off';
  vibration = false;
  private nextId = 1;
  private summaryBuffer: FeedbackEvent[] = [];
  private summaryTimer: number | undefined;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  private readonly o: FeedbackOptions;

  constructor(o: FeedbackOptions) {
    this.o = o;
    window.terrajukeLog = [];
  }

  newId(): number {
    return this.nextId++;
  }

  setAnnouncements(mode: Announcements): void {
    this.announcements = mode;
    window.clearInterval(this.summaryTimer);
    this.summaryBuffer = [];
    if (mode === 'summary') this.summaryTimer = window.setInterval(() => this.flushSummary(), 5000);
  }

  emit(ev: FeedbackEvent): void {
    let audioAt: number | null = null;
    try {
      // Sound must never block the visual, text and tactile channels.
      this.o.audio.play(ev.plan);
      if (!this.o.audio.muted) audioAt = performance.now();
    } catch (err) {
      console.warn('TerraJuke audio unavailable:', err);
    }
    this.pulse(ev);
    const pulseAt = performance.now();
    this.o.caption.textContent = ev.text;
    const captionAt = performance.now();
    let announcedAt: number | null = null;
    if (this.announcements === 'selection' && ev.origin === 'user') {
      this.o.announcer.say(ev.text);
      announcedAt = performance.now();
    } else if (this.announcements === 'summary') {
      this.summaryBuffer.push(ev);
    }
    let vibratedAt: number | null = null;
    if (this.vibration && vibrationSupported()) {
      navigator.vibrate(VIBRATION_PATTERNS[ev.direction]);
      vibratedAt = performance.now();
    }
    const log = (window.terrajukeLog ??= []);
    log.push({ id: ev.id, direction: ev.direction, figure: ev.plan.figure, audioAt, pulseAt, captionAt, announcedAt, vibratedAt, text: ev.text });
    if (log.length > 100) log.splice(0, log.length - 100);
  }

  stop(): void {
    this.o.audio.stop();
    this.o.pulseLayer.replaceChildren();
    if (vibrationSupported() && this.vibration) navigator.vibrate(0);
  }

  private pulse(ev: FeedbackEvent): void {
    const ring = document.createElement('div');
    const { rect } = ev;
    const w = rect.x1 - rect.x0 + 1;
    const h = rect.y1 - rect.y0 + 1;
    const cx = rect.x0 + w / 2;
    const cy = rect.y0 + h / 2;
    // Ring size grows with the lit share (0.7× to 1.6× the region). A very large area (the
    // whole map) flashes its own outline instead of a ring.
    const wide = w > 300;
    const scale = 0.7 + Math.min(0.9, ev.litFraction * 9);
    const size = Math.max(w, h) * scale;
    ring.className = `pulse pulse-${ev.direction}${wide ? ' pulse-area' : ''}`;
    ring.dataset.eventId = String(ev.id);
    ring.dataset.direction = ev.direction;
    ring.dataset.pulses = String(ev.plan.pulses);
    const bw = wide ? w : size;
    const bh = wide ? h : size;
    ring.style.left = `${((cx - bw / 2) / IMAGE_WIDTH) * 100}%`;
    ring.style.top = `${((cy - bh / 2) / IMAGE_HEIGHT) * 100}%`;
    ring.style.width = `${(bw / IMAGE_WIDTH) * 100}%`;
    ring.style.height = `${(bh / IMAGE_HEIGHT) * 100}%`;
    if (this.reducedMotion.matches) {
      ring.classList.add('pulse-static');
    } else {
      ring.style.animationDuration = `${EVENT_SECONDS / ev.plan.pulses}s`;
      ring.style.animationIterationCount = String(ev.plan.pulses);
    }
    this.o.pulseLayer.replaceChildren(ring);
    window.setTimeout(() => ring.remove(), EVENT_SECONDS * 1000 + 600);
  }

  private flushSummary(): void {
    const evs = this.summaryBuffer;
    this.summaryBuffer = [];
    if (!evs.length) return;
    const n = (d: Direction) => evs.filter((e) => e.direction === d).length;
    const parts = [
      n('more') && `${n('more')} rising (more light)`,
      n('less') && `${n('less')} falling (less light)`,
      n('steady') && `${n('steady')} steady`,
    ].filter(Boolean);
    this.o.announcer.say(`Last 5 seconds: ${evs.length} sound${evs.length === 1 ? '' : 's'}, ${parts.join(', ')}.`);
  }
}
