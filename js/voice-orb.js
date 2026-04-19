/**
 * VoiceOrb — Animated visualization orb for the chat mode
 * Renders a Perlin-noise-displaced circle with state-based behavior:
 *   IDLE     → subtle breathing, cyan glow
 *   LISTENING → mic-reactive surface displacement, teal
 *   THINKING  → pulsing expansion/contraction, purple glow
 *   SPEAKING  → dynamic wave displacement, gold
 */
import { lerp, smoothstep, noise2D, fbm, hsl, clamp, mapRange } from './utils.js';
import bus from './event-bus.js';

const VERTEX_COUNT = 128;
const TWO_PI = Math.PI * 2;

// State color definitions [H, S, L]
const STATE_COLORS = {
    idle:       { h: 190, s: 85, l: 55 },
    listening:  { h: 160, s: 90, l: 50 },
    processing: { h: 270, s: 75, l: 60 },
    speaking:   { h: 35,  s: 100, l: 65 },
};

export default class VoiceOrb {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Current state
        this.state = 'idle';
        this.time = 0;

        // Interpolated values
        this.color = { ...STATE_COLORS.idle };
        this.targetColor = { ...STATE_COLORS.idle };
        this.amplitude = 0;
        this.targetAmplitude = 0;
        this.pulsePhase = 0;
        this.glowIntensity = 0.3;
        this.targetGlow = 0.3;
        this.baseRadius = 0;

        // Audio amplitude (set externally)
        this.audioAmplitude = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.w = rect.width;
        this.h = rect.height;
        this.cx = this.w / 2;
        this.cy = this.h / 2;
        this.baseRadius = Math.min(this.w, this.h) * 0.25;
    }

    /**
     * Transition to a new state
     */
    setState(newState) {
        if (newState === this.state) return;
        this.state = newState;

        const c = STATE_COLORS[newState] || STATE_COLORS.idle;
        this.targetColor = { ...c };

        switch (newState) {
            case 'idle':
                this.targetAmplitude = 0.03;
                this.targetGlow = 0.3;
                break;
            case 'listening':
                this.targetAmplitude = 0.08;
                this.targetGlow = 0.5;
                break;
            case 'processing':
                this.targetAmplitude = 0.06;
                this.targetGlow = 0.7;
                break;
            case 'speaking':
                this.targetAmplitude = 0.12;
                this.targetGlow = 0.6;
                break;
        }
    }

    /**
     * Update and render one frame
     * @param {number} dt - Delta time in seconds
     * @param {number} audioAmp - Current audio amplitude [0..1]
     */
    update(dt, audioAmp = 0) {
        this.time += dt;
        this.audioAmplitude = audioAmp;

        // Smooth interpolation of visual properties
        const lerpSpeed = dt * 3;
        this.color.h = lerp(this.color.h, this.targetColor.h, lerpSpeed);
        this.color.s = lerp(this.color.s, this.targetColor.s, lerpSpeed);
        this.color.l = lerp(this.color.l, this.targetColor.l, lerpSpeed);
        this.amplitude = lerp(this.amplitude, this.targetAmplitude, lerpSpeed);
        this.glowIntensity = lerp(this.glowIntensity, this.targetGlow, lerpSpeed);

        this._render();
    }

    _render() {
        const { ctx, w, h, cx, cy, time } = this;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Calculate current radius with breathing/pulsing
        let breathe = 0;
        if (this.state === 'processing') {
            // Thinking pulse: slow expand/contract
            breathe = Math.sin(time * 2) * 0.08 + Math.sin(time * 3.7) * 0.04;
        } else if (this.state === 'idle') {
            breathe = Math.sin(time * 1.2) * 0.02;
        }

        const radius = this.baseRadius * (1 + breathe);

        // Audio-driven amplitude
        const audioDisplacement = this.state === 'speaking'
            ? this.audioAmplitude * this.baseRadius * 0.4
            : this.state === 'listening'
                ? this.audioAmplitude * this.baseRadius * 0.35
                : 0;

        // ─── Draw glow layers ─────────────────────────
        const glowLayers = 4;
        for (let g = glowLayers; g >= 1; g--) {
            const glowRadius = radius + g * 20 * this.glowIntensity;
            const alpha = (this.glowIntensity * 0.08) / g;
            const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
            gradient.addColorStop(0, hsl(this.color.h, this.color.s, this.color.l + 15, alpha * 2));
            gradient.addColorStop(0.5, hsl(this.color.h, this.color.s, this.color.l, alpha));
            gradient.addColorStop(1, hsl(this.color.h, this.color.s, this.color.l, 0));

            ctx.beginPath();
            ctx.arc(cx, cy, glowRadius, 0, TWO_PI);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // ─── Draw main blob with noise displacement ───
        const noiseScale = 1.2;
        const noiseSpeed = this.state === 'processing' ? 0.8 : 0.4;

        // Multiple blob layers for depth
        for (let layer = 2; layer >= 0; layer--) {
            const layerRadius = radius * (1 - layer * 0.05);
            const layerAlpha = layer === 0 ? 0.9 : (layer === 1 ? 0.3 : 0.15);
            const layerNoiseAmp = this.amplitude * (1 + layer * 0.5);

            ctx.beginPath();

            for (let i = 0; i <= VERTEX_COUNT; i++) {
                const angle = (i / VERTEX_COUNT) * TWO_PI;
                const nx = Math.cos(angle) * noiseScale;
                const ny = Math.sin(angle) * noiseScale;

                // Perlin displacement
                const n = fbm(nx + time * noiseSpeed, ny + time * noiseSpeed * 0.7, 3);
                const displacement = n * layerRadius * layerNoiseAmp;

                // Audio displacement
                const audioWave = audioDisplacement * Math.sin(angle * 8 + time * 12) *
                    (0.5 + 0.5 * Math.sin(angle * 3 + time * 5));

                const r = layerRadius + displacement + audioWave;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }

            ctx.closePath();

            if (layer === 0) {
                // Main fill
                const grad = ctx.createRadialGradient(
                    cx - radius * 0.2, cy - radius * 0.2, 0,
                    cx, cy, layerRadius * 1.2
                );
                grad.addColorStop(0, hsl(this.color.h, this.color.s, this.color.l + 20, layerAlpha));
                grad.addColorStop(0.6, hsl(this.color.h, this.color.s, this.color.l, layerAlpha));
                grad.addColorStop(1, hsl(this.color.h, this.color.s, this.color.l - 15, layerAlpha * 0.7));
                ctx.fillStyle = grad;
                ctx.fill();

                // Stroke
                ctx.strokeStyle = hsl(this.color.h, this.color.s, this.color.l + 15, 0.6);
                ctx.lineWidth = 1.5;
                ctx.stroke();
            } else {
                // Outer glow layers
                ctx.strokeStyle = hsl(this.color.h, this.color.s, this.color.l + 10, layerAlpha);
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // ─── Center highlight ─────────────────────────
        const highlightGrad = ctx.createRadialGradient(
            cx - radius * 0.15, cy - radius * 0.15, 0,
            cx, cy, radius * 0.6
        );
        highlightGrad.addColorStop(0, hsl(this.color.h, 40, 95, 0.15));
        highlightGrad.addColorStop(1, hsl(this.color.h, 40, 95, 0));
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.6, 0, TWO_PI);
        ctx.fillStyle = highlightGrad;
        ctx.fill();

        // ─── State indicator ring ─────────────────────
        if (this.state === 'processing') {
            const ringRadius = radius * 1.25;
            const dashOffset = time * 60;
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, ringRadius, 0, TWO_PI);
            ctx.strokeStyle = hsl(this.color.h, this.color.s, this.color.l, 0.25);
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 16]);
            ctx.lineDashOffset = -dashOffset;
            ctx.stroke();
            ctx.restore();
        }

        // ─── Speaking waveform ring ───────────────────
        if (this.state === 'speaking' && this.audioAmplitude > 0.01) {
            const ringRadius = radius * 1.15;
            ctx.beginPath();
            for (let i = 0; i <= VERTEX_COUNT; i++) {
                const angle = (i / VERTEX_COUNT) * TWO_PI;
                const wave = Math.sin(angle * 12 + time * 10) * this.audioAmplitude * 15;
                const r = ringRadius + wave;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = hsl(this.color.h, this.color.s, this.color.l + 10, 0.4);
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    destroy() {
        window.removeEventListener('resize', this._resize);
    }
}
