// pixel-buffer.js — a minimal, isomorphic image representation.
//
// Deliberately NOT tied to ImageData, HTMLCanvasElement, or any Node
// image library — those are platform-specific and would break the
// "runs unmodified in Node" requirement. A PixelBuffer is just:
//   { width, height, data: Uint8ClampedArray }  // always RGBA, 4 bytes/px
//
// The browser side converts a PixelBuffer to a three.js DataTexture (or an
// ImageData for canvas rasterization) in ONE line — see Atlas Builder
// (Module 7, not yet built). Node tests use PixelBuffers directly.

export function createPixelBuffer(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function clonePixelBuffer(buf) {
  return { width: buf.width, height: buf.height, data: Uint8ClampedArray.from(buf.data) };
}

export function getPixel(buf, x, y) {
  const xi = ((x % buf.width) + buf.width) % buf.width;
  const yi = ((y % buf.height) + buf.height) % buf.height;
  const i = (yi * buf.width + xi) * 4;
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]];
}

export function setPixel(buf, x, y, r, g, b, a = 255) {
  const i = (y * buf.width + x) * 4;
  buf.data[i] = r; buf.data[i + 1] = g; buf.data[i + 2] = b; buf.data[i + 3] = a;
}

/** Bilinear sample at fractional pixel coords, wrapping at the edges. */
export function sampleBilinear(buf, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const p00 = getPixel(buf, x0, y0);
  const p10 = getPixel(buf, x0 + 1, y0);
  const p01 = getPixel(buf, x0, y0 + 1);
  const p11 = getPixel(buf, x0 + 1, y0 + 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = lerp(p00[c], p10[c], fx);
    const bottom = lerp(p01[c], p11[c], fx);
    out[c] = lerp(top, bottom, fy);
  }
  return out;
}

export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function computeLuminanceHistogram(buf) {
  let min = 255, max = 0;
  for (let i = 0; i < buf.data.length; i += 4) {
    const l = luminance(buf.data[i], buf.data[i + 1], buf.data[i + 2]);
    if (l < min) min = l;
    if (l > max) max = l;
  }
  return { min, max };
}

export function makeSyntheticMarbleAlbedo(width, height, seed, baseColor = [242, 239, 233]) {
  const buf = createPixelBuffer(width, height);
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const veins = Array.from({ length: 5 }, () => ({
    freq: 0.05 + rng() * 0.1,
    phase: rng() * Math.PI * 2,
    amp: 10 + rng() * 25,
  }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let veinSignal = 0;
      for (const v of veins) {
        veinSignal += Math.sin((x + y) * v.freq + v.phase) * v.amp;
      }
      const shade = Math.max(0, Math.min(255, baseColor[0] - Math.abs(veinSignal)));
      setPixel(
        buf, x, y,
        Math.round(shade),
        Math.round(Math.max(0, Math.min(255, baseColor[1] - Math.abs(veinSignal) * 0.9))),
        Math.round(Math.max(0, Math.min(255, baseColor[2] - Math.abs(veinSignal) * 0.8))),
        255
      );
    }
  }
  return buf;
}
