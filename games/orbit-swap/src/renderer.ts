import type { GameEventMessage } from '@minigamehub/game-core';
import Phaser from 'phaser';
import asteroidUrl from './assets/asteroid.png';
import astronautUrl from './assets/astronaut.png';
import backdropUrl from './assets/backdrop.jpg';
import centreUrl from './assets/centre.png';
import starUrl from './assets/star.png';
import { LANE_RADIUS_PX, LANES, ORBIT, TAU } from './constants';
import { SnapshotBuffer } from './interpolate';
import { hazardAngle, type Hazard } from './sim';
import type { OrbitFullState, OrbitSnapshot, PackedHazard, PackedStar } from './types';

const SIZE = 640;
const C = SIZE / 2;
const PALETTE = [0xff6858, 0x68ddb1, 0xf8cf46, 0x4b8eff, 0xffb3c9, 0x94e1ed, 0xc6d579, 0xf6f1e8];
const INTERP_DELAY_MS = 110;

/** Texture keys for the illustrated art (AI-generated; see docs/LEGAL.md). Missing art falls back to shapes. */
const ART = { bg: 'os-bg', centre: 'os-centre', asteroid: 'os-asteroid', astronaut: 'os-astronaut', star: 'os-star' } as const;

/** Reusable sprites: one per thing drawn this frame, hidden when not needed (no per-frame allocation). */
function acquire(pool: Phaser.GameObjects.Image[], i: number, scene: Phaser.Scene, key: string, depth: number): Phaser.GameObjects.Image {
  let im = pool[i];
  if (!im) {
    im = scene.add.image(0, 0, key).setDepth(depth);
    pool[i] = im;
  }
  return im.setVisible(true);
}
function releaseFrom(pool: Phaser.GameObjects.Image[], from: number): void {
  for (let i = from; i < pool.length; i++) pool[i]!.setVisible(false);
}

export interface OrbitViewOptions {
  parent: HTMLElement;
  me: string;
  names: Record<string, string>;
  reducedMotion: boolean;
  onScores: (scores: Record<string, number>) => void;
  onSfx: (name: 'good' | 'bad' | 'tick' | 'go' | 'win') => void;
}

export interface OrbitView {
  setFull(state: OrbitFullState): void;
  onEvent(e: GameEventMessage): void;
  destroy(): void;
}

const laneRadius = (lane: number) => LANE_RADIUS_PX[0] + lane * (LANE_RADIUS_PX[1] - LANE_RADIUS_PX[0]);

function unpackHazard(h: PackedHazard): Hazard {
  return { id: h[0], lane: h[1], angle0: h[2], omega: h[3], width: h[4], t0: h[5], expiresAt: h[6] };
}

/**
 * Pure renderer: it draws what the server says. It owns no game rules - positions come from
 * interpolated snapshots, hazards are extrapolated from server-provided motion parameters, and
 * scores are whatever the server last reported.
 */
export function createOrbitView(opts: OrbitViewOptions): OrbitView {
  const buffer = new SnapshotBuffer();
  let full: OrbitFullState | null = null;
  let fullAt = performance.now();
  let order: string[] = [];
  let hazards = new Map<number, Hazard>();
  let stars = new Map<number, PackedStar>();
  let snapAt = performance.now();
  let lastScoresAt = 0;
  let shake = 0;
  const pops: { x: number; y: number; text: string; born: number }[] = [];
  const nameLabels = new Map<string, Phaser.GameObjects.Text>();

  let gfx: Phaser.GameObjects.Graphics;
  let hud: Phaser.GameObjects.Text;
  let big: Phaser.GameObjects.Text;
  let popText: Phaser.GameObjects.Text;
  let centre: Phaser.GameObjects.Image | null = null;
  let artReady = false;
  const asteroidSprites: Phaser.GameObjects.Image[] = [];
  const starSprites: Phaser.GameObjects.Image[] = [];
  const astronautSprites: Phaser.GameObjects.Image[] = [];

  const simTime = () => {
    const last = buffer.latest;
    if (!last) return 0;
    return last.t + (performance.now() - snapAt);
  };

  class OrbitScene extends Phaser.Scene {
    constructor() {
      super('orbit');
    }
    preload() {
      this.load.image(ART.bg, backdropUrl);
      this.load.image(ART.centre, centreUrl);
      this.load.image(ART.asteroid, asteroidUrl);
      this.load.image(ART.astronaut, astronautUrl);
      this.load.image(ART.star, starUrl);
    }
    create() {
      artReady = Object.values(ART).every((k) => this.textures.exists(k));
      if (artReady) {
        this.add.image(C, C, ART.bg).setDisplaySize(SIZE, SIZE).setDepth(-1);
        centre = this.add.image(C, C, ART.centre).setDepth(0.5);
      }
      gfx = this.add.graphics().setDepth(1);
      hud = this.add.text(18, 14, '', { fontFamily: 'IBM Plex Sans Variable, system-ui, sans-serif', fontSize: '24px', color: '#e9eeff', fontStyle: 'bold', stroke: '#0b1226', strokeThickness: 4 });
      big = this.add.text(C, C, '', { fontFamily: 'Pixelify Sans Variable, system-ui, sans-serif', fontSize: '120px', color: '#ffffff', fontStyle: '800' }).setOrigin(0.5).setDepth(10);
      popText = this.add.text(0, 0, '', { fontFamily: 'IBM Plex Sans Variable, system-ui, sans-serif', fontSize: '22px', color: '#ffe7a3', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setDepth(9);
    }
    override update() {
      draw(this);
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width: SIZE,
    height: SIZE,
    backgroundColor: '#151e23',
    transparent: false,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: OrbitScene,
    render: { antialias: true },
  });

  function colorOf(id: string): number {
    const i = order.indexOf(id);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]!;
  }

  function labelFor(scene: Phaser.Scene, id: string): Phaser.GameObjects.Text {
    let t = nameLabels.get(id);
    if (!t) {
      t = scene.add
        .text(0, 0, (opts.names[id] ?? '?').slice(0, 10), { fontFamily: 'IBM Plex Sans Variable, system-ui, sans-serif', fontSize: '15px', color: '#e9eeff', fontStyle: 'bold', stroke: '#0b1226', strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(5);
      nameLabels.set(id, t);
    }
    return t;
  }

  function starPoints(x: number, y: number, outer: number, inner: number, rot: number) {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    return pts;
  }

  function draw(scene: Phaser.Scene) {
    const now = performance.now();
    const g = gfx;
    g.clear();
    const t = simTime() - INTERP_DELAY_MS;
    const off = shake > 0 && !opts.reducedMotion ? (Math.random() - 0.5) * shake : 0;
    if (shake > 0) shake = Math.max(0, shake - 0.8);
    scene.cameras.main.setScroll(off, off);

    // Lane rings (on top of the backdrop's own soft ripples) and the centre planet
    for (let l = 0; l < LANES; l++) {
      g.lineStyle(artReady ? 4 : 2, artReady ? 0xffffff : 0x4b6f85, artReady ? 0.4 : 1);
      g.strokeCircle(C, C, LANE_RADIUS_PX[l]!);
    }
    if (artReady && centre) {
      const pulse = opts.reducedMotion ? 1 : 1 + Math.sin(now / 700) * 0.04;
      centre.setPosition(C, C).setDisplaySize(170 * pulse, 170 * pulse);
    } else {
      g.fillStyle(0x243c51, 1);
      g.fillCircle(C, C, 74);
      g.fillStyle(0x4b8eff, 0.6);
      g.fillCircle(C, C, 52);
      g.fillStyle(0xffb547, 1);
      g.fillCircle(C, C, 22);
    }

    // Hazards: arcs on their lane, extrapolated from server-provided motion. With art, a chain of
    // asteroids covers the arc (the hit area is still the server's arc, so the picture matches it).
    let ai = 0;
    for (const h of hazards.values()) {
      if (t < h.t0 - 50 || t > h.expiresAt) continue;
      const a = hazardAngle(h, Math.max(t, h.t0));
      const fade = Math.min(1, (t - h.t0) / 250, (h.expiresAt - t) / 400);
      if (artReady) {
        const r = laneRadius(h.lane);
        const n = Math.max(2, Math.round((h.width * r) / 30));
        for (let k = 0; k < n; k++) {
          const ang = a - h.width / 2 + (h.width * (k + 0.5)) / n;
          acquire(asteroidSprites, ai++, scene, ART.asteroid, 2)
            .setPosition(C + Math.cos(ang) * r, C + Math.sin(ang) * r)
            .setDisplaySize(38, 38)
            .setAlpha(Math.max(0.2, fade))
            .setRotation(opts.reducedMotion ? 0 : now / 900 + k);
        }
      } else {
        g.lineStyle(20, 0xff6b5e, Math.max(0.15, fade));
        g.beginPath();
        g.arc(C, C, laneRadius(h.lane), a - h.width / 2, a + h.width / 2, false);
        g.strokePath();
      }
    }
    releaseFrom(asteroidSprites, ai);

    // Stars
    const tNow = simTime();
    let si = 0;
    for (const s of stars.values()) {
      if (tNow > s[4]) continue;
      const r = laneRadius(s[1]);
      const x = C + Math.cos(s[2]) * r;
      const y = C + Math.sin(s[2]) * r;
      const gold = s[3] >= ORBIT.goldStarPoints;
      const spin = opts.reducedMotion ? 0 : now / 900;
      if (artReady) {
        if (gold) {
          g.fillStyle(0xffd34d, 0.3);
          g.fillCircle(x, y, 26);
        }
        const size = gold ? 40 : 28;
        acquire(starSprites, si++, scene, ART.star, 3)
          .setPosition(x, y)
          .setDisplaySize(size, size)
          .setRotation(opts.reducedMotion ? 0 : Math.sin(now / 400 + s[0]) * 0.3)
          .clearTint();
      } else {
        g.fillStyle(gold ? 0xffd34d : 0xffe7a3, 1);
        g.fillPoints(starPoints(x, y, gold ? 15 : 11, gold ? 7 : 5, spin), true);
      }
    }
    releaseFrom(starSprites, si);

    // Players (interpolated)
    const ps = buffer.sample(t);
    let remaining = full?.matchMs ?? ORBIT.matchMs;
    let pi = 0;
    if (ps) {
      for (let i = 0; i < ps.length; i++) {
        const id = order[i];
        const p = ps[i];
        if (!id || !p) continue;
        const [ang, lane, , inv, , conn] = p;
        const r = laneRadius(lane);
        const x = C + Math.cos(ang) * r;
        const y = C + Math.sin(ang) * r;
        const mine = id === opts.me;
        const blink = inv === 1 && !opts.reducedMotion && Math.floor(now / 110) % 2 === 0;
        const alpha = conn ? (blink ? 0.35 : 1) : 0.25;
        if (mine) {
          g.lineStyle(3, 0xffffff, 0.9);
          g.strokeCircle(x, y, artReady ? 35 : 22);
        }
        if (artReady) {
          // Each player's colour is a ring and soft glow under their astronaut.
          g.fillStyle(colorOf(id), alpha * 0.3);
          g.fillCircle(x, y, 29);
          g.lineStyle(4, colorOf(id), alpha);
          g.strokeCircle(x, y, 29);
          acquire(astronautSprites, pi++, scene, ART.astronaut, 4).setPosition(x, y).setDisplaySize(56, 56).setAlpha(alpha);
        } else {
          g.fillStyle(colorOf(id), alpha);
          g.fillCircle(x, y, 14);
          g.fillStyle(0x0b1226, alpha);
          g.fillCircle(x + Math.cos(ang + Math.PI / 2) * 0, y, 5);
        }
        const label = labelFor(scene, id);
        label.setPosition(x, y - (artReady ? 42 : 28)).setAlpha(conn ? 1 : 0.4);
      }
    }
    releaseFrom(astronautSprites, pi);
    remaining = Math.max(0, (full?.matchMs ?? ORBIT.matchMs) - Math.max(0, simTime()));

    // HUD
    const myIdx = order.indexOf(opts.me);
    const myScore = ps && myIdx >= 0 ? ps[myIdx]![4] : 0;
    const secs = Math.ceil(remaining / 1000);
    hud.setText(`${myIdx >= 0 ? `Score ${myScore}   ` : 'Watching   '}${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);

    // Countdown / end overlay
    if (full?.phase === 'countdown') {
      const left = Math.max(0, full.countdownMs - (now - fullAt));
      const n = Math.ceil(left / 1000);
      big.setText(n > 0 ? String(n) : 'GO').setVisible(true);
    } else if (full?.phase === 'done') {
      big.setText('Time!').setVisible(true).setFontSize(96);
    } else if (now - fullAt < 700 && full?.phase === 'playing' && full.t < 1200) {
      big.setText('GO').setVisible(true);
    } else big.setVisible(false);

    // Floating +N popups
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]!;
      const age = now - p.born;
      if (age > 800) pops.splice(i, 1);
    }
    const p0 = pops[pops.length - 1];
    if (p0) popText.setText(p0.text).setPosition(p0.x, p0.y - (opts.reducedMotion ? 0 : (now - p0.born) / 20)).setAlpha(1 - (now - p0.born) / 800).setVisible(true);
    else popText.setVisible(false);

    // Report scores ~5Hz
    if (ps && now - lastScoresAt > 200) {
      lastScoresAt = now;
      const scores: Record<string, number> = {};
      order.forEach((id, i) => (scores[id] = ps[i]?.[4] ?? 0));
      opts.onScores(scores);
    }
  }

  return {
    setFull(state) {
      full = state;
      fullAt = performance.now();
      order = state.order;
      hazards = new Map(state.hazards.map((h) => [h[0], unpackHazard(h)]));
      stars = new Map(state.stars.map((s) => [s[0], s]));
      buffer.push({ t: state.t, p: state.players });
      snapAt = performance.now();
    },
    onEvent(e) {
      switch (e.type) {
        case 'snap': {
          const s = e as unknown as OrbitSnapshot;
          buffer.push({ t: s.t, p: s.p });
          snapAt = performance.now();
          break;
        }
        case 'hazard': {
          const h = unpackHazard((e as unknown as { h: PackedHazard }).h);
          hazards.set(h.id, h);
          break;
        }
        case 'star': {
          const s = (e as unknown as { s: PackedStar }).s;
          stars.set(s[0], s);
          break;
        }
        case 'starx': {
          stars.delete(Number((e as unknown as { id: number }).id));
          break;
        }
        case 'collect': {
          const c = e as unknown as { id: string; v: number };
          if (c.id === opts.me) {
            opts.onSfx('good');
            const i = order.indexOf(opts.me);
            const p = buffer.latest?.p[i];
            if (p) pops.push({ x: C + Math.cos(p[0]) * laneRadius(p[1]), y: C + Math.sin(p[0]) * laneRadius(p[1]), text: `+${c.v}`, born: performance.now() });
          }
          break;
        }
        case 'hit': {
          if ((e as unknown as { id: string }).id === opts.me) {
            opts.onSfx('bad');
            shake = 14;
          }
          break;
        }
      }
    },
    destroy() {
      nameLabels.clear();
      game.destroy(true);
    },
  };
}

void TAU;
