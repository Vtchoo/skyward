/** Seeded improved Perlin noise. Sampling in planet-space keeps face seams continuous. */
export class PerlinNoise {
  private readonly permutation = new Uint16Array(512);
  constructor(seed: string) {
    let state = 2166136261;
    for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    const random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let n = Math.imul(state ^ state >>> 15, 1 | state);
      n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
    const values = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    for (let i = 0; i < 512; i++) this.permutation[i] = values[i & 255];
  }
  sample(x: number, y: number, z: number): number {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    x -= ix; y -= iy; z -= iz;
    const X = ix & 255, Y = iy & 255, Z = iz & 255, p = this.permutation;
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const grad = (hash: number, a: number, b: number, c: number) => {
      const h = hash & 15, u = h < 8 ? a : b, v = h < 4 ? b : h === 12 || h === 14 ? a : c;
      return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    };
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const u = fade(x), v = fade(y), w = fade(z);
    return lerp(lerp(lerp(grad(p[AA], x,y,z), grad(p[BA], x-1,y,z), u),
      lerp(grad(p[AB], x,y-1,z), grad(p[BB], x-1,y-1,z), u), v),
    lerp(lerp(grad(p[AA+1], x,y,z-1), grad(p[BA+1], x-1,y,z-1), u),
      lerp(grad(p[AB+1], x,y-1,z-1), grad(p[BB+1], x-1,y-1,z-1), u), v), w);
  }
}
