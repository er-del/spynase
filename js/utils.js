/**
 * Utils — Math helpers, noise functions, color utilities
 * Core utility functions for Synapse visualizations
 */

// ─── Interpolation ────────────────────────────────────────────────
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function smoothstep(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
}

export function smootherstep(t) {
    t = clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function mapRange(val, inMin, inMax, outMin, outMax) {
    return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
}

// ─── Easing ───────────────────────────────────────────────────────
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// ─── Color Utilities ──────────────────────────────────────────────
export function hsl(h, s, l, a = 1) {
    if (a < 1) return `hsla(${h}, ${s}%, ${l}%, ${a})`;
    return `hsl(${h}, ${s}%, ${l}%)`;
}

export function lerpColor(h1, s1, l1, h2, s2, l2, t) {
    return {
        h: lerp(h1, h2, t),
        s: lerp(s1, s2, t),
        l: lerp(l1, l2, t),
    };
}

// ─── Simplex-style 2D Noise ───────────────────────────────────────
// Compact Perlin-esque noise implementation
const PERM = new Uint8Array(512);
const GRAD = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
];

// Initialize permutation table
(function initNoise() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle with fixed seed for determinism
    let seed = 42;
    for (let i = 255; i > 0; i--) {
        seed = (seed * 16807 + 0) % 2147483647;
        const j = seed % (i + 1);
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function dot2(g, x, y) {
    return g[0] * x + g[1] * y;
}

/**
 * 2D Perlin noise, returns value in [-1, 1]
 */
export function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = PERM[PERM[X] + Y] & 7;
    const ab = PERM[PERM[X] + Y + 1] & 7;
    const ba = PERM[PERM[X + 1] + Y] & 7;
    const bb = PERM[PERM[X + 1] + Y + 1] & 7;

    const x1 = lerp(dot2(GRAD[aa], xf, yf), dot2(GRAD[ba], xf - 1, yf), u);
    const x2 = lerp(dot2(GRAD[ab], xf, yf - 1), dot2(GRAD[bb], xf - 1, yf - 1), u);

    return lerp(x1, x2, v);
}

/**
 * Fractal Brownian Motion (layered noise)
 */
export function fbm(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise2D(x * frequency, y * frequency);
        maxValue += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }

    return value / maxValue;
}

// ─── 3D Projection ───────────────────────────────────────────────
/**
 * Project a 3D point onto 2D screen with perspective
 * @param {number} x - 3D x
 * @param {number} y - 3D y
 * @param {number} z - 3D z
 * @param {number} fov - Field of view (perspective strength)
 * @param {number} cx - Screen center x
 * @param {number} cy - Screen center y
 * @returns {{x: number, y: number, scale: number, depth: number}}
 */
export function project3D(x, y, z, fov, cx, cy) {
    const scale = fov / (fov + z);
    return {
        x: x * scale + cx,
        y: y * scale + cy,
        scale: scale,
        depth: z,
    };
}

/**
 * Rotate a 3D point around the Y axis
 */
export function rotateY(x, y, z, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: x * cos - z * sin,
        y: y,
        z: x * sin + z * cos,
    };
}

/**
 * Rotate a 3D point around the X axis
 */
export function rotateX(x, y, z, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: x,
        y: y * cos - z * sin,
        z: y * sin + z * cos,
    };
}

/**
 * Rotate a 3D point around the Z axis
 */
export function rotateZ(x, y, z, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: x * cos - y * sin,
        y: x * sin + y * cos,
        z: z,
    };
}

// ─── Geometry Helpers ─────────────────────────────────────────────
/**
 * Distribute N points on a sphere using Fibonacci spiral
 */
export function fibonacciSphere(n) {
    const points = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2; // -1 to 1
        const radius = Math.sqrt(1 - y * y);
        const theta = goldenAngle * i;

        points.push({
            x: Math.cos(theta) * radius,
            y: y,
            z: Math.sin(theta) * radius,
        });
    }
    return points;
}

/**
 * Generate random value with seed
 */
export function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Distance between two 3D points
 */
export function dist3D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Distance between two 2D points
 */
export function dist2D(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
