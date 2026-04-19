/**
 * NeuralSphere — 3D Holographic Neural Network Sphere (Enhanced)
 * 
 * Renders a dense sci-fi energy sphere on 2D canvas with perspective projection.
 * Inspired by holographic energy constructs — radial filaments, plasma arcs,
 * web grid floor, chromatic rings, ambient particles, and layered plasma core.
 * 
 * Features:
 *   - Dense Fibonacci-distributed nodes on sphere surface
 *   - 3D→2D perspective projection with depth-based effects
 *   - Radial energy filaments shooting outward from the sphere
 *   - Branching lightning/plasma arcs with glow halos
 *   - Perspective web/mesh grid floor beneath the sphere
 *   - Multi-layered gradient plasma core with animated pulsation
 *   - Hundreds of ambient floating particles for depth
 *   - Chromatic dual-color energy rings (orange/cyan)
 *   - Multiple orbiting ring systems with glowing arcs
 *   - Wireframe geodesic lattice on sphere surface
 *   - Particle streams flowing along connections
 *   - Token-driven node activation and expansion
 *   - Thought intensity: faster tokens → brighter, faster, denser
 *   - Cinematic motion-blur trails
 */
import {
    lerp, clamp, mapRange, noise2D, fbm,
    project3D, rotateX, rotateY, rotateZ,
    fibonacciSphere, dist3D, seededRandom, hsl
} from './utils.js';
import bus from './event-bus.js';

// ─── Configuration ────────────────────────────────────────────────
const MAX_NODES = 400;
const MAX_EDGES = 800;
const MAX_PARTICLES = 800;
const MAX_ARCS = 40;
const MAX_FILAMENTS = 70;
const MAX_AMBIENT_PARTICLES = 300;
const SPHERE_BASE_RADIUS = 200;
const FOV = 600;
const ORBIT_RING_COUNT = 10;
const LATITUDE_RING_COUNT = 6;
const CHROMATIC_RING_COUNT = 6;

// Grid configuration
const GRID_EXTENT = 3.5;      // How far the grid extends (in sphere radii)
const GRID_DIVISIONS = 28;    // Number of grid lines
const GRID_Y_OFFSET = 1.15;   // How far below center the grid sits

export default class NeuralSphere {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Sphere state
        this.time = 0;
        this.rotationY = 0;
        this.rotationX = 0.3;
        this.radius = SPHERE_BASE_RADIUS;
        this.targetRadius = SPHERE_BASE_RADIUS;

        // Nodes & edges
        this.nodes = [];
        this.edges = [];
        this.particles = [];
        this.arcs = [];
        this.activeNodeIndex = 0;

        // Fibonacci base positions (normalized to unit sphere)
        this._basePositions = fibonacciSphere(MAX_NODES);

        // Visual state
        this.intensity = 0.3;
        this.targetIntensity = 0.3;
        this.state = 'idle';
        this.tokenRate = 0;

        // Color palette [H, S, L]
        this.primaryColor = { h: 35, s: 100, l: 55 };
        this.accentColor = { h: 200, s: 90, l: 60 };
        this.energyColor = { h: 25, s: 100, l: 65 };

        // Smoothly interpolated colors
        this._currentPrimary = { ...this.primaryColor };
        this._currentAccent = { ...this.accentColor };
        this._currentEnergy = { ...this.energyColor };

        // ─── Orbit rings ───────────────────────────
        this.rings = [];
        const rng = seededRandom(99);
        for (let i = 0; i < ORBIT_RING_COUNT; i++) {
            this.rings.push({
                tiltX: (rng() - 0.5) * 2.0,
                tiltZ: (rng() - 0.5) * 1.2,
                radius: 0.6 + rng() * 0.6,
                speed: 0.1 + rng() * 0.6,
                phase: rng() * Math.PI * 2,
                width: 0.4 + rng() * 1.8,
                segments: 60 + Math.floor(rng() * 60),
                arcLength: 0.3 + rng() * 0.6,
                direction: rng() > 0.5 ? 1 : -1,
            });
        }

        // ─── Latitude wireframe rings ──────────────
        this.latRings = [];
        for (let i = 0; i < LATITUDE_RING_COUNT; i++) {
            const lat = (i / (LATITUDE_RING_COUNT - 1)) * Math.PI - Math.PI / 2;
            this.latRings.push({
                lat,
                radius: Math.cos(lat),
                y: Math.sin(lat),
                segments: 48,
            });
        }

        // ─── Chromatic rings (dual-color) ──────────
        this.chromaticRings = [];
        const crng = seededRandom(137);
        for (let i = 0; i < CHROMATIC_RING_COUNT; i++) {
            this.chromaticRings.push({
                tiltX: (crng() - 0.5) * 2.5,
                tiltZ: (crng() - 0.5) * 1.8,
                radius: 0.75 + crng() * 0.5,
                speed: 0.15 + crng() * 0.45,
                phase: crng() * Math.PI * 2,
                width: 0.6 + crng() * 1.2,
                segments: 80,
                arcLength: 0.2 + crng() * 0.5,
                direction: crng() > 0.5 ? 1 : -1,
                colorIndex: i % 2, // 0 = primary, 1 = accent (cyan)
            });
        }

        // ─── Energy filaments ──────────────────────
        this.filaments = [];
        this._initFilaments();

        // ─── Ambient floating particles ────────────
        this.ambientParticles = [];
        this._initAmbientParticles();

        // Initialize with more seed nodes for density
        this._initNodes(60);

        // Subscribe to token events
        bus.on('token:received', (data) => this._onToken(data));
        bus.on('state:change', (data) => this._onStateChange(data));

        this._resize();
        this._boundResize = () => this._resize();
        window.addEventListener('resize', this._boundResize);
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
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
        this.targetRadius = Math.min(this.w, this.h) * 0.28;
    }

    // ─── Initialization ───────────────────────────────────────────

    _initNodes(count) {
        const rng = seededRandom(42);
        for (let i = 0; i < count; i++) {
            this._addNodeAt(i, 1.0);
        }
        for (let i = 1; i < count; i++) {
            const parentIdx = Math.floor(rng() * i);
            this._addEdge(parentIdx, i);
            if (rng() < 0.5 && i > 2) {
                const extraIdx = Math.floor(rng() * i);
                if (extraIdx !== parentIdx) this._addEdge(extraIdx, i);
            }
        }
        this.activeNodeIndex = count;
    }

    _initFilaments() {
        const rng = seededRandom(777);
        for (let i = 0; i < MAX_FILAMENTS; i++) {
            const theta = rng() * Math.PI * 2;
            const phi = rng() * Math.PI;
            const dx = Math.sin(phi) * Math.cos(theta);
            const dy = Math.cos(phi);
            const dz = Math.sin(phi) * Math.sin(theta);
            this.filaments.push({
                x: dx, y: dy, z: dz,
                length: 0.3 + rng() * 0.8,
                phase: rng() * Math.PI * 2,
                speed: 0.5 + rng() * 2.0,
                width: 0.3 + rng() * 1.5,
                waveAmp: 0.02 + rng() * 0.06,
                waveFreq: 2 + rng() * 5,
                colorShift: rng() * 60 - 30, // -30 to +30 hue shift
                brightness: 0.4 + rng() * 0.6,
            });
        }
    }

    _initAmbientParticles() {
        const rng = seededRandom(314);
        for (let i = 0; i < MAX_AMBIENT_PARTICLES; i++) {
            const theta = rng() * Math.PI * 2;
            const phi = rng() * Math.PI;
            const dist = 0.3 + rng() * 2.0;
            this.ambientParticles.push({
                theta, phi, dist,
                speed: 0.05 + rng() * 0.2,
                phaseX: rng() * Math.PI * 2,
                phaseY: rng() * Math.PI * 2,
                size: 0.3 + rng() * 1.5,
                brightness: 0.2 + rng() * 0.8,
                colorIndex: rng() > 0.5 ? 0 : 1, // 0 = primary, 1 = accent
            });
        }
    }

    _addNodeAt(index, life = 0) {
        if (index >= MAX_NODES) index = index % MAX_NODES;
        const bp = this._basePositions[index];
        this.nodes[index] = {
            x: bp.x, y: bp.y, z: bp.z,
            active: true,
            life: life,
            pulse: 0,
            energy: 0.5 + Math.random() * 0.5,
            size: 1.2 + Math.random() * 2.5,
        };
    }

    _addEdge(fromIdx, toIdx) {
        if (this.edges.length >= MAX_EDGES) {
            this.edges.shift();
        }
        this.edges.push({
            from: fromIdx,
            to: toIdx,
            life: 0,
            maxLife: 1,
            growProgress: 0,
        });
    }

    _spawnParticle(fromNode, toNode) {
        if (this.particles.length >= MAX_PARTICLES) {
            this.particles.shift();
        }
        this.particles.push({
            from: { x: fromNode.x, y: fromNode.y, z: fromNode.z },
            to: { x: toNode.x, y: toNode.y, z: toNode.z },
            t: 0,
            speed: 0.4 + Math.random() * 0.8,
            size: 0.5 + Math.random() * 1.5,
            life: 1,
        });
    }

    _spawnArc() {
        if (this.arcs.length >= MAX_ARCS) return;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const dx = Math.sin(phi) * Math.cos(theta);
        const dy = Math.cos(phi);
        const dz = Math.sin(phi) * Math.sin(theta);
        
        // Generate jagged lightning segments
        const segmentCount = 6 + Math.floor(Math.random() * 10);
        const segments = [];
        let cx = dx, cy = dy, cz = dz;
        const reach = 0.3 + Math.random() * 0.6;
        
        for (let s = 0; s <= segmentCount; s++) {
            const t = s / segmentCount;
            const jitter = (1 - t * 0.5) * 0.08;
            segments.push({
                x: cx + (Math.random() - 0.5) * jitter,
                y: cy + (Math.random() - 0.5) * jitter,
                z: cz + (Math.random() - 0.5) * jitter,
            });
            cx = dx * (1 + t * reach);
            cy = dy * (1 + t * reach);
            cz = dz * (1 + t * reach);
        }

        // Branching
        const branches = [];
        if (Math.random() < 0.6) {
            const branchAt = Math.floor(Math.random() * (segmentCount - 2)) + 1;
            const branchSeg = segments[branchAt];
            const bCount = 3 + Math.floor(Math.random() * 4);
            const bDir = {
                x: branchSeg.x + (Math.random() - 0.5) * 0.3,
                y: branchSeg.y + (Math.random() - 0.5) * 0.3,
                z: branchSeg.z + (Math.random() - 0.5) * 0.3,
            };
            const bSegs = [{ ...branchSeg }];
            for (let b = 1; b <= bCount; b++) {
                const bt = b / bCount;
                bSegs.push({
                    x: lerp(branchSeg.x, bDir.x, bt) + (Math.random() - 0.5) * 0.04,
                    y: lerp(branchSeg.y, bDir.y, bt) + (Math.random() - 0.5) * 0.04,
                    z: lerp(branchSeg.z, bDir.z, bt) + (Math.random() - 0.5) * 0.04,
                });
            }
            branches.push(bSegs);
        }

        this.arcs.push({
            segments,
            branches,
            life: 1,
            speed: 1.5 + Math.random() * 2.5,
            width: 0.5 + Math.random() * 1.5,
            colorShift: Math.random() * 40 - 20,
        });
    }

    // ─── Event Handlers ───────────────────────────────────────────

    _onToken(data) {
        const { index, tokenRate } = data;
        this.targetIntensity = clamp(mapRange(tokenRate, 2, 30, 0.3, 1.0), 0.2, 1.0);
        this.tokenRate = tokenRate;

        const nodeIdx = this.activeNodeIndex % MAX_NODES;
        this._addNodeAt(nodeIdx, 0);
        this.nodes[nodeIdx].pulse = 1.0;

        if (this.activeNodeIndex > 0) {
            const parentIdx = (nodeIdx - 1 - Math.floor(Math.random() * 4) + MAX_NODES) % MAX_NODES;
            if (this.nodes[parentIdx]?.active) {
                this._addEdge(parentIdx, nodeIdx);
                for (let p = 0; p < 3; p++) {
                    this._spawnParticle(this.nodes[parentIdx], this.nodes[nodeIdx]);
                }
            }
        }

        for (let c = 0; c < 2; c++) {
            if (Math.random() < 0.5) {
                const randIdx = Math.floor(Math.random() * Math.min(this.activeNodeIndex, MAX_NODES));
                if (this.nodes[randIdx]?.active && randIdx !== nodeIdx) {
                    this._addEdge(randIdx, nodeIdx);
                }
            }
        }

        // Spawn arcs more aggressively
        if (tokenRate > 5 && Math.random() < 0.5) {
            this._spawnArc();
        }
        if (tokenRate > 15 && Math.random() < 0.3) {
            this._spawnArc();
        }

        this.activeNodeIndex++;
    }

    _onStateChange(data) {
        this.state = data.state;
        switch (data.state) {
            case 'idle': this.targetIntensity = 0.25; break;
            case 'processing': this.targetIntensity = 0.55; break;
            case 'speaking': this.targetIntensity = 0.65; break;
        }
    }

    // ─── Update Loop ──────────────────────────────────────────────

    update(dt) {
        this.time += dt;

        this.radius = lerp(this.radius, this.targetRadius, dt * 3);
        this.intensity = lerp(this.intensity, this.targetIntensity, dt * 2);

        // Smooth color transitions
        const cSpeed = dt * 1.5;
        this._currentPrimary.h = lerp(this._currentPrimary.h, this.primaryColor.h, cSpeed);
        this._currentPrimary.s = lerp(this._currentPrimary.s, this.primaryColor.s, cSpeed);
        this._currentPrimary.l = lerp(this._currentPrimary.l, this.primaryColor.l, cSpeed);
        this._currentAccent.h = lerp(this._currentAccent.h, this.accentColor.h, cSpeed);
        this._currentAccent.s = lerp(this._currentAccent.s, this.accentColor.s, cSpeed);
        this._currentAccent.l = lerp(this._currentAccent.l, this.accentColor.l, cSpeed);
        this._currentEnergy.h = lerp(this._currentEnergy.h, this.energyColor.h, cSpeed);

        const rotSpeed = 0.12 + this.intensity * 0.3;
        this.rotationY += dt * rotSpeed;
        this.rotationX = 0.25 + Math.sin(this.time * 0.25) * 0.18;

        // Update nodes
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (!node || !node.active) continue;
            node.life = Math.min(node.life + dt * 1.5, 1);
            node.pulse = Math.max(node.pulse - dt * 2.5, 0);
        }

        // Update edges
        for (const edge of this.edges) {
            edge.growProgress = Math.min(edge.growProgress + dt * 3, 1);
            edge.life = Math.min(edge.life + dt * 0.5, edge.maxLife);
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.t += dt * p.speed;
            p.life -= dt * 0.4;
            if (p.t >= 1 || p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update arcs
        for (let i = this.arcs.length - 1; i >= 0; i--) {
            const arc = this.arcs[i];
            arc.life -= dt * arc.speed;
            if (arc.life <= 0) {
                this.arcs.splice(i, 1);
            }
        }

        // Ambient particle spawning
        const spawnRate = this.intensity * 0.5;
        if (Math.random() < spawnRate) {
            const idx = Math.floor(Math.random() * this.edges.length);
            const edge = this.edges[idx];
            if (edge) {
                const fn = this.nodes[edge.from];
                const tn = this.nodes[edge.to];
                if (fn && tn) this._spawnParticle(fn, tn);
            }
        }

        // Ambient arc spawning
        if (this.intensity > 0.3 && Math.random() < this.intensity * 0.08) {
            this._spawnArc();
        }

        this._render();
    }

    // ─── Projection ───────────────────────────────────────────────

    _project(x, y, z) {
        let p = rotateY(x, y, z, this.rotationY);
        p = rotateX(p.x, p.y, p.z, this.rotationX);
        return project3D(p.x * this.radius, p.y * this.radius, p.z * this.radius, FOV, this.cx, this.cy);
    }

    _projectRaw(x, y, z) {
        let p = rotateY(x, y, z, this.rotationY);
        p = rotateX(p.x, p.y, p.z, this.rotationX);
        return project3D(p.x, p.y, p.z, FOV, this.cx, this.cy);
    }

    // ─── Main Render ──────────────────────────────────────────────

    _render() {
        const { ctx, w, h, cx, cy, time, intensity } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        // Clear with heavy trail for cinematic motion blur
        ctx.fillStyle = `rgba(5, 5, 12, ${0.08 + intensity * 0.03})`;
        ctx.fillRect(0, 0, w, h);

        // Background glow — multi-layered
        const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius * 2.5);
        bgGlow.addColorStop(0, hsl(pc.h, 80, 35, 0.08 * intensity));
        bgGlow.addColorStop(0.2, hsl(pc.h, 60, 25, 0.04 * intensity));
        bgGlow.addColorStop(0.5, hsl(ac.h, 50, 20, 0.02 * intensity));
        bgGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = bgGlow;
        ctx.fillRect(0, 0, w, h);

        // ─── Render layers (back to front) ────────────
        // 1. Web grid floor (behind everything)
        this._renderWebGrid();

        // 2. Ambient floating particles (far layer)
        this._renderAmbientParticles();

        // 3. Latitude/longitude wireframe
        this._renderLatitudeRings();

        // 4. Orbit rings
        this._renderOrbitRings();

        // 5. Chromatic energy rings
        this._renderChromaticRings();

        // 6. Collect drawables for depth sorting
        const drawables = [];
        const projectedNodes = new Array(this.nodes.length);

        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (!node || !node.active) continue;
            const proj = this._project(node.x, node.y, node.z);
            projectedNodes[i] = proj;
            drawables.push({ type: 'node', index: i, depth: proj.depth, proj, node });
        }

        for (const edge of this.edges) {
            const pFrom = projectedNodes[edge.from];
            const pTo = projectedNodes[edge.to];
            if (!pFrom || !pTo) continue;
            drawables.push({ type: 'edge', depth: (pFrom.depth + pTo.depth) / 2, pFrom, pTo, edge });
        }

        drawables.sort((a, b) => b.depth - a.depth);

        // 7. Render edges
        for (const d of drawables) {
            if (d.type === 'edge') this._renderEdge(d);
        }

        // 8. Stream particles
        this._renderParticles();

        // 9. Render nodes
        for (const d of drawables) {
            if (d.type === 'node') this._renderNode(d);
        }

        // 10. Energy filaments (on top of sphere)
        this._renderEnergyFilaments();

        // 11. Lightning arcs
        this._renderArcs();

        // 12. Core glow (enhanced plasma)
        this._renderCoreGlow();

        // 13. Circuit overlay
        this._renderCircuitOverlay();

        // 14. Outer aura
        this._renderOuterAura();
    }

    // ═════════════════════════════════════════════════════════════════
    //  NEW: Web/Mesh Grid Floor
    // ═════════════════════════════════════════════════════════════════

    _renderWebGrid() {
        const { ctx, cx, cy, radius, intensity, time } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        const gridY = radius * GRID_Y_OFFSET;
        const extent = radius * GRID_EXTENT;
        const divs = GRID_DIVISIONS;
        const step = (extent * 2) / divs;

        // Scanning pulse position (sweeps across grid)
        const scanT = (Math.sin(time * 0.6) * 0.5 + 0.5);
        const scanZ = -extent + scanT * extent * 2;
        const scanT2 = (Math.cos(time * 0.45) * 0.5 + 0.5);
        const scanX = -extent + scanT2 * extent * 2;

        // Draw grid lines (Z direction)
        for (let i = 0; i <= divs; i++) {
            const x = -extent + i * step;
            const points = [];
            const segCount = 20;

            for (let j = 0; j <= segCount; j++) {
                const z = -extent + (j / segCount) * extent * 2;
                const proj = this._projectRaw(x, gridY, z);
                // Perspective curvature near sphere
                const distFromCenter = Math.sqrt(x * x + z * z) / extent;
                points.push({ ...proj, distFromCenter, worldZ: z, worldX: x });
            }

            for (let j = 1; j < points.length; j++) {
                const p0 = points[j - 1];
                const p1 = points[j];
                const fade = 1 - Math.pow(Math.max(p0.distFromCenter, p1.distFromCenter), 1.5);
                if (fade <= 0.01) continue;

                // Scan line glow
                const scanDist = Math.abs(p0.worldZ - scanZ) / (extent * 0.3);
                const scanGlow = Math.max(0, 1 - scanDist) * 0.5;

                const alpha = (0.03 + intensity * 0.06 + scanGlow * intensity) * fade;

                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = hsl(ac.h, 60, 45 + scanGlow * 30, alpha);
                ctx.lineWidth = 0.4 + scanGlow * 1.5;
                ctx.stroke();
            }
        }

        // Draw grid lines (X direction)
        for (let i = 0; i <= divs; i++) {
            const z = -extent + i * step;
            const points = [];
            const segCount = 20;

            for (let j = 0; j <= segCount; j++) {
                const x = -extent + (j / segCount) * extent * 2;
                const proj = this._projectRaw(x, gridY, z);
                const distFromCenter = Math.sqrt(x * x + z * z) / extent;
                points.push({ ...proj, distFromCenter, worldX: x, worldZ: z });
            }

            for (let j = 1; j < points.length; j++) {
                const p0 = points[j - 1];
                const p1 = points[j];
                const fade = 1 - Math.pow(Math.max(p0.distFromCenter, p1.distFromCenter), 1.5);
                if (fade <= 0.01) continue;

                const scanDist = Math.abs(p0.worldX - scanX) / (extent * 0.3);
                const scanGlow = Math.max(0, 1 - scanDist) * 0.5;

                const alpha = (0.03 + intensity * 0.06 + scanGlow * intensity) * fade;

                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = hsl(pc.h, 50, 42 + scanGlow * 25, alpha);
                ctx.lineWidth = 0.4 + scanGlow * 1.5;
                ctx.stroke();
            }
        }

        // Glowing intersection nodes
        for (let i = 0; i <= divs; i += 2) {
            for (let j = 0; j <= divs; j += 2) {
                const x = -extent + i * step;
                const z = -extent + j * step;
                const distFromCenter = Math.sqrt(x * x + z * z) / extent;
                const fade = 1 - Math.pow(distFromCenter, 1.5);
                if (fade <= 0.05) continue;

                const proj = this._projectRaw(x, gridY, z);

                // Proximity to scan lines
                const sd1 = Math.abs(z - scanZ) / (extent * 0.2);
                const sd2 = Math.abs(x - scanX) / (extent * 0.2);
                const nodeScan = Math.max(0, 1 - Math.min(sd1, sd2)) * 0.8;

                const size = (0.6 + nodeScan * 3) * fade * (0.5 + intensity * 0.5);
                const alpha = (0.08 + nodeScan * 0.5 + intensity * 0.1) * fade;

                if (size > 0.3) {
                    // Node glow
                    const glow = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, size * 4);
                    glow.addColorStop(0, hsl(ac.h, 80, 70, alpha * 0.6));
                    glow.addColorStop(1, 'transparent');
                    ctx.fillStyle = glow;
                    ctx.fillRect(proj.x - size * 4, proj.y - size * 4, size * 8, size * 8);

                    // Node core
                    ctx.beginPath();
                    ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = hsl(ac.h, 90, 75, alpha);
                    ctx.fill();
                }
            }
        }

        // Central glow on the grid (beneath sphere)
        const gridCenterProj = this._projectRaw(0, gridY, 0);
        const gridGlow = ctx.createRadialGradient(
            gridCenterProj.x, gridCenterProj.y, 0,
            gridCenterProj.x, gridCenterProj.y, radius * 1.2
        );
        gridGlow.addColorStop(0, hsl(pc.h, 80, 50, 0.08 * intensity));
        gridGlow.addColorStop(0.5, hsl(ac.h, 60, 40, 0.03 * intensity));
        gridGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = gridGlow;
        ctx.beginPath();
        ctx.arc(gridCenterProj.x, gridCenterProj.y, radius * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // ═════════════════════════════════════════════════════════════════
    //  NEW: Energy Filaments
    // ═════════════════════════════════════════════════════════════════

    _renderEnergyFilaments() {
        const { ctx, cx, cy, radius, intensity, time } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        for (const fil of this.filaments) {
            const visIntensity = intensity * fil.brightness;
            if (visIntensity < 0.05) continue;

            const segCount = 16;
            const points = [];

            for (let s = 0; s <= segCount; s++) {
                const t = s / segCount;
                const scale = 1 + t * fil.length * (1 + intensity * 0.5);

                // Wave displacement
                const wavePhase = time * fil.speed + fil.phase;
                const wave = Math.sin(wavePhase + t * fil.waveFreq) * fil.waveAmp * (1 + t);

                const px = fil.x * scale + wave * fil.z;
                const py = fil.y * scale + wave * 0.5;
                const pz = fil.z * scale - wave * fil.x;

                const proj = this._project(px, py, pz);
                points.push({ ...proj, t });
            }

            // Draw filament with gradient along length
            for (let s = 1; s < points.length; s++) {
                const p0 = points[s - 1];
                const p1 = points[s];
                const t = (p0.t + p1.t) / 2;

                // Fade at tip
                const tipFade = 1 - Math.pow(t, 2);
                const flicker = 0.6 + 0.4 * Math.sin(time * fil.speed * 3 + fil.phase + t * 10);
                const alpha = visIntensity * tipFade * flicker * 0.35;

                if (alpha < 0.01) continue;

                // Color: blend from primary (hot) at base to accent (cool) at tip
                const colorH = lerp(pc.h + fil.colorShift, ac.h, t);
                const colorL = lerp(65, 50, t);

                const width = fil.width * (1 - t * 0.7) * (0.4 + intensity * 0.6);

                // Glow pass
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = hsl(colorH, 85, colorL, alpha * 0.4);
                ctx.lineWidth = width * 4;
                ctx.stroke();

                // Core pass
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = hsl(colorH, 90, colorL + 20, alpha);
                ctx.lineWidth = width;
                ctx.stroke();
            }

            // Bright dot at filament origin
            if (visIntensity > 0.15) {
                const baseProj = points[0];
                const dotAlpha = visIntensity * 0.5;
                ctx.beginPath();
                ctx.arc(baseProj.x, baseProj.y, 1.5 * (0.5 + intensity), 0, Math.PI * 2);
                ctx.fillStyle = hsl(pc.h + fil.colorShift, 100, 85, dotAlpha);
                ctx.fill();
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════
    //  NEW: Ambient Floating Particles
    // ═════════════════════════════════════════════════════════════════

    _renderAmbientParticles() {
        const { ctx, intensity, time } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        for (const ap of this.ambientParticles) {
            // Orbiting motion
            const theta = ap.theta + time * ap.speed;
            const phi = ap.phi + Math.sin(time * ap.speed * 0.7 + ap.phaseY) * 0.3;
            const dist = ap.dist + Math.sin(time * 0.3 + ap.phaseX) * 0.15;

            const x = Math.sin(phi) * Math.cos(theta) * dist;
            const y = Math.cos(phi) * dist;
            const z = Math.sin(phi) * Math.sin(theta) * dist;

            const proj = this._project(x, y, z);
            const depthAlpha = clamp(mapRange(proj.depth, -this.radius * 2, this.radius * 2, 1, 0.1), 0.05, 1);

            const flicker = 0.5 + 0.5 * Math.sin(time * 4 + ap.phaseX * 10);
            const alpha = depthAlpha * ap.brightness * intensity * flicker * 0.4;
            const size = ap.size * proj.scale * (0.3 + intensity * 0.7);

            if (size < 0.15 || alpha < 0.02) continue;

            const color = ap.colorIndex === 0 ? pc : ac;

            // Tiny glow
            if (size > 0.5) {
                const glow = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, size * 3);
                glow.addColorStop(0, hsl(color.h, 80, 70, alpha * 0.5));
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.fillRect(proj.x - size * 3, proj.y - size * 3, size * 6, size * 6);
            }

            ctx.beginPath();
            ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
            ctx.fillStyle = hsl(color.h, 85, 75, alpha);
            ctx.fill();
        }
    }

    // ═════════════════════════════════════════════════════════════════
    //  NEW: Chromatic Energy Rings (Dual-color)
    // ═════════════════════════════════════════════════════════════════

    _renderChromaticRings() {
        const { ctx, cx, cy, time, radius, intensity } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        for (const ring of this.chromaticRings) {
            const color = ring.colorIndex === 0 ? pc : ac;
            const points = [];
            const ringR = radius * ring.radius;
            const arcStart = ring.phase + time * ring.speed * ring.direction;
            const arcEnd = arcStart + Math.PI * 2 * ring.arcLength;

            for (let i = 0; i <= ring.segments; i++) {
                const t = i / ring.segments;
                const angle = lerp(arcStart, arcEnd, t);
                let x = Math.cos(angle) * ringR;
                let y = 0;
                let z = Math.sin(angle) * ringR;

                // Tilt
                const cosT = Math.cos(ring.tiltX);
                const sinT = Math.sin(ring.tiltX);
                const y2 = y * cosT - z * sinT;
                const z2 = y * sinT + z * cosT;
                const cosZ = Math.cos(ring.tiltZ);
                const sinZ = Math.sin(ring.tiltZ);
                const x2 = x * cosZ - y2 * sinZ;
                const y3 = x * sinZ + y2 * cosZ;

                let p = rotateY(x2, y3, z2, this.rotationY);
                p = rotateX(p.x, p.y, p.z, this.rotationX);
                const proj = project3D(p.x, p.y, p.z, FOV, cx, cy);
                points.push({ ...proj, t });
            }

            // Draw ring with depth and edge fade
            for (let i = 1; i < points.length; i++) {
                const p0 = points[i - 1];
                const p1 = points[i];
                const depthAlpha = clamp(mapRange((p0.depth + p1.depth) / 2, -radius, radius, 0.9, 0.1), 0.05, 0.9);
                const edgeFade = Math.min(p0.t * 4, (1 - p0.t) * 4, 1);
                const alpha = (0.12 + intensity * 0.3) * depthAlpha * edgeFade;

                // Glow pass
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = hsl(color.h, 85, 55 + intensity * 15, alpha * 0.35);
                ctx.lineWidth = ring.width * 4 * ((p0.scale + p1.scale) / 2);
                ctx.stroke();

                // Core
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = hsl(color.h, 90, 60 + intensity * 15, alpha);
                ctx.lineWidth = ring.width * (0.4 + intensity * 0.6) * ((p0.scale + p1.scale) / 2);
                ctx.stroke();
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════
    //  Existing (refined): Latitude Rings
    // ═════════════════════════════════════════════════════════════════

    _renderLatitudeRings() {
        const { ctx, cx, cy, time, radius, intensity } = this;
        const pc = this._currentPrimary;

        for (const lr of this.latRings) {
            const points = [];
            const ringR = lr.radius;
            const segCount = lr.segments;

            for (let i = 0; i <= segCount; i++) {
                const angle = (i / segCount) * Math.PI * 2;
                const x = Math.cos(angle) * ringR;
                const y = lr.y;
                const z = Math.sin(angle) * ringR;
                const proj = this._project(x, y, z);
                points.push(proj);
            }

            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                if (i === 0) ctx.moveTo(points[i].x, points[i].y);
                else ctx.lineTo(points[i].x, points[i].y);
            }
            const alpha = 0.04 + intensity * 0.06;
            ctx.strokeStyle = hsl(pc.h, 50, 45, alpha);
            ctx.lineWidth = 0.3 + intensity * 0.3;
            ctx.stroke();
        }

        // Longitude lines
        const lonCount = 12;
        for (let l = 0; l < lonCount; l++) {
            const lonAngle = (l / lonCount) * Math.PI * 2;
            ctx.beginPath();
            for (let i = 0; i <= 32; i++) {
                const lat = (i / 32) * Math.PI - Math.PI / 2;
                const x = Math.cos(lat) * Math.cos(lonAngle);
                const y = Math.sin(lat);
                const z = Math.cos(lat) * Math.sin(lonAngle);
                const proj = this._project(x, y, z);
                if (i === 0) ctx.moveTo(proj.x, proj.y);
                else ctx.lineTo(proj.x, proj.y);
            }
            const alpha = 0.03 + intensity * 0.04;
            ctx.strokeStyle = hsl(pc.h, 40, 40, alpha);
            ctx.lineWidth = 0.3;
            ctx.stroke();
        }
    }

    _renderOrbitRings() {
        const { ctx, cx, cy, time, radius, intensity } = this;
        const pc = this._currentPrimary;

        for (const ring of this.rings) {
            const points = [];
            const ringR = radius * ring.radius;
            const arcStart = ring.phase + time * ring.speed * ring.direction;
            const arcEnd = arcStart + Math.PI * 2 * ring.arcLength;

            for (let i = 0; i <= ring.segments; i++) {
                const t = i / ring.segments;
                const angle = lerp(arcStart, arcEnd, t);
                let x = Math.cos(angle) * ringR;
                let y = 0;
                let z = Math.sin(angle) * ringR;

                const cosT = Math.cos(ring.tiltX);
                const sinT = Math.sin(ring.tiltX);
                const y2 = y * cosT - z * sinT;
                const z2 = y * sinT + z * cosT;
                const cosZ = Math.cos(ring.tiltZ);
                const sinZ = Math.sin(ring.tiltZ);
                const x2 = x * cosZ - y2 * sinZ;
                const y3 = x * sinZ + y2 * cosZ;

                let p = rotateY(x2, y3, z2, this.rotationY);
                p = rotateX(p.x, p.y, p.z, this.rotationX);
                const proj = project3D(p.x, p.y, p.z, FOV, cx, cy);
                points.push({ ...proj, t });
            }

            for (let i = 1; i < points.length; i++) {
                const p0 = points[i - 1];
                const p1 = points[i];
                const depthAlpha = clamp(mapRange((p0.depth + p1.depth) / 2, -radius, radius, 0.9, 0.1), 0.05, 0.9);
                const edgeFade = Math.min(p0.t * 4, (1 - p0.t) * 4, 1);
                const alpha = (0.15 + intensity * 0.35) * depthAlpha * edgeFade;

                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = hsl(pc.h, 80, 55 + intensity * 15, alpha);
                ctx.lineWidth = ring.width * (0.4 + intensity * 0.6) * ((p0.scale + p1.scale) / 2);
                ctx.stroke();
            }

            // Glow pass
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                if (i === 0) ctx.moveTo(points[i].x, points[i].y);
                else ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.strokeStyle = hsl(pc.h, 90, 65, 0.03 * intensity);
            ctx.lineWidth = ring.width * 3;
            ctx.stroke();
        }
    }

    _renderNode(d) {
        const { ctx, intensity } = this;
        const pc = this._currentPrimary;
        const { proj, node } = d;

        const depthAlpha = clamp(mapRange(proj.depth, -this.radius, this.radius, 1, 0.1), 0.08, 1);
        const alpha = depthAlpha * node.life;
        const size = (node.size + node.pulse * 5) * proj.scale * (0.5 + intensity * 0.5);

        if (size < 0.2 || alpha < 0.04) return;

        // Glow
        if (size > 0.8) {
            const glow = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, size * 5);
            glow.addColorStop(0, hsl(pc.h, 90, 70, alpha * 0.35 * (1 + node.pulse * 2)));
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.fillRect(proj.x - size * 5, proj.y - size * 5, size * 10, size * 10);
        }

        // Core
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
        const bright = 55 + intensity * 20 + node.pulse * 30;
        ctx.fillStyle = hsl(pc.h, 85, clamp(bright, 50, 95), alpha);
        ctx.fill();

        // Hot center on pulse
        if (node.pulse > 0.15) {
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, size * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = hsl(pc.h - 10, 100, 90, alpha * node.pulse);
            ctx.fill();
        }
    }

    _renderEdge(d) {
        const { ctx, intensity } = this;
        const pc = this._currentPrimary;
        const { pFrom, pTo, edge } = d;

        const depthAlpha = clamp(
            mapRange(Math.max(pFrom.depth, pTo.depth), -this.radius, this.radius, 0.6, 0.04),
            0.02, 0.6
        );
        const alpha = depthAlpha * edge.life * (0.25 + intensity * 0.45);
        if (alpha < 0.015) return;

        const progress = edge.growProgress;
        const endX = lerp(pFrom.x, pTo.x, progress);
        const endY = lerp(pFrom.y, pTo.y, progress);

        ctx.beginPath();
        ctx.moveTo(pFrom.x, pFrom.y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = hsl(pc.h, 65, 50, alpha);
        ctx.lineWidth = 0.4 + intensity * 0.7;
        ctx.stroke();
    }

    _renderParticles() {
        const { ctx, intensity } = this;
        const ec = this._currentEnergy;

        for (const p of this.particles) {
            const x = lerp(p.from.x, p.to.x, p.t);
            const y = lerp(p.from.y, p.to.y, p.t);
            const z = lerp(p.from.z, p.to.z, p.t);

            const proj = this._project(x, y, z);
            const depthAlpha = clamp(mapRange(proj.depth, -this.radius, this.radius, 1, 0.15), 0.1, 1);
            const alpha = p.life * depthAlpha;
            const size = p.size * proj.scale * (0.4 + intensity * 0.6);

            if (size < 0.15 || alpha < 0.04) continue;

            // Glow
            const glow = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, size * 3.5);
            glow.addColorStop(0, hsl(ec.h, 100, 75, alpha * 0.7));
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.fillRect(proj.x - size * 3.5, proj.y - size * 3.5, size * 7, size * 7);

            // Core
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
            ctx.fillStyle = hsl(ec.h, 100, 88, alpha);
            ctx.fill();
        }
    }

    // ═════════════════════════════════════════════════════════════════
    //  Enhanced: Branching Lightning Arcs
    // ═════════════════════════════════════════════════════════════════

    _renderArcs() {
        const { ctx, intensity } = this;
        const pc = this._currentPrimary;

        for (const arc of this.arcs) {
            const alpha = arc.life * 0.7 * intensity;
            if (alpha < 0.02) continue;

            // ── Main lightning path ──
            this._drawLightningPath(arc.segments, arc, alpha, pc.h + arc.colorShift);

            // ── Branches ──
            for (const branch of arc.branches) {
                this._drawLightningPath(branch, arc, alpha * 0.5, pc.h + arc.colorShift + 15);
            }
        }
    }

    _drawLightningPath(segments, arc, alpha, colorH) {
        const { ctx } = this;

        const projSegs = segments.map(s => this._project(s.x, s.y, s.z));

        // Wide glow pass
        ctx.beginPath();
        for (let i = 0; i < projSegs.length; i++) {
            if (i === 0) ctx.moveTo(projSegs[i].x, projSegs[i].y);
            else ctx.lineTo(projSegs[i].x, projSegs[i].y);
        }
        ctx.strokeStyle = hsl(colorH, 80, 55, alpha * 0.25);
        ctx.lineWidth = arc.width * arc.life * 6;
        ctx.stroke();

        // Medium glow pass
        ctx.beginPath();
        for (let i = 0; i < projSegs.length; i++) {
            if (i === 0) ctx.moveTo(projSegs[i].x, projSegs[i].y);
            else ctx.lineTo(projSegs[i].x, projSegs[i].y);
        }
        ctx.strokeStyle = hsl(colorH, 90, 70, alpha * 0.5);
        ctx.lineWidth = arc.width * arc.life * 2.5;
        ctx.stroke();

        // Core (white-hot)
        ctx.beginPath();
        for (let i = 0; i < projSegs.length; i++) {
            if (i === 0) ctx.moveTo(projSegs[i].x, projSegs[i].y);
            else ctx.lineTo(projSegs[i].x, projSegs[i].y);
        }
        ctx.strokeStyle = hsl(colorH - 5, 60, 92, alpha * 0.9);
        ctx.lineWidth = arc.width * arc.life * 0.8;
        ctx.stroke();

        // Tip flash
        const tip = projSegs[projSegs.length - 1];
        if (arc.life > 0.4 && tip) {
            const flashSize = 3 * arc.life * arc.width;
            const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, flashSize * 3);
            glow.addColorStop(0, hsl(colorH - 10, 100, 95, alpha * 0.7));
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.fillRect(tip.x - flashSize * 3, tip.y - flashSize * 3, flashSize * 6, flashSize * 6);
        }
    }

    // ═════════════════════════════════════════════════════════════════
    //  Enhanced: Multi-layer Plasma Core
    // ═════════════════════════════════════════════════════════════════

    _renderCoreGlow() {
        const { ctx, cx, cy, radius, intensity, time } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        // Outer ambient glow
        const ambientSize = radius * 0.5 * (1 + Math.sin(time * 1.2) * 0.15 * intensity);
        const ambientGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, ambientSize * 3);
        ambientGlow.addColorStop(0, hsl(pc.h, 100, 80, 0.1 * intensity));
        ambientGlow.addColorStop(0.15, hsl(pc.h, 95, 65, 0.06 * intensity));
        ambientGlow.addColorStop(0.35, hsl(ac.h, 70, 50, 0.03 * intensity));
        ambientGlow.addColorStop(0.6, hsl(pc.h, 60, 40, 0.015 * intensity));
        ambientGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = ambientGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, ambientSize * 3, 0, Math.PI * 2);
        ctx.fill();

        // Pulsating core
        const pulseSize = radius * 0.2 * (1 + Math.sin(time * 1.8) * 0.25 * intensity);
        const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseSize * 4);
        coreGlow.addColorStop(0, hsl(pc.h, 100, 92, 0.2 * intensity));
        coreGlow.addColorStop(0.1, hsl(pc.h, 100, 80, 0.14 * intensity));
        coreGlow.addColorStop(0.25, hsl(pc.h, 95, 65, 0.08 * intensity));
        coreGlow.addColorStop(0.45, hsl(ac.h, 80, 55, 0.04 * intensity));
        coreGlow.addColorStop(0.7, hsl(pc.h, 60, 45, 0.015 * intensity));
        coreGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseSize * 4, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright core
        const innerSize = pulseSize * 0.25;
        ctx.beginPath();
        ctx.arc(cx, cy, innerSize, 0, Math.PI * 2);
        ctx.fillStyle = hsl(pc.h - 5, 100, 95, 0.35 * intensity);
        ctx.fill();

        // Secondary inner ring
        ctx.beginPath();
        ctx.arc(cx, cy, innerSize * 2, 0, Math.PI * 2);
        ctx.strokeStyle = hsl(pc.h, 90, 80, 0.12 * intensity);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Tertiary ring (accent color)
        const tertiarySize = pulseSize * 0.8;
        ctx.beginPath();
        ctx.arc(cx, cy, tertiarySize, 0, Math.PI * 2);
        ctx.strokeStyle = hsl(ac.h, 70, 60, 0.06 * intensity);
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Animated core ring
        const ringAngle = time * 0.6;
        const coreRingR = pulseSize * 0.6;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, coreRingR, ringAngle, ringAngle + Math.PI * 1.2);
        ctx.strokeStyle = hsl(pc.h, 100, 85, 0.15 * intensity);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, coreRingR, ringAngle + Math.PI, ringAngle + Math.PI * 2.2);
        ctx.strokeStyle = hsl(ac.h, 90, 75, 0.1 * intensity);
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
    }

    _renderCircuitOverlay() {
        const { ctx, cx, cy, radius, intensity, time } = this;
        const pc = this._currentPrimary;

        // Concentric HUD circles
        const ringCount = 5;
        for (let i = 1; i <= ringCount; i++) {
            const r = radius * (0.3 + i * 0.2);
            const alpha = 0.02 + intensity * 0.035;

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = hsl(pc.h, 45, 42, alpha);
            ctx.lineWidth = 0.4;
            ctx.stroke();

            // Tick marks
            const tickCount = 6 + i * 4;
            for (let j = 0; j < tickCount; j++) {
                const angle = (j / tickCount) * Math.PI * 2 + time * 0.08 * (i % 2 ? 1 : -1);
                const nx = cx + Math.cos(angle) * r;
                const ny = cy + Math.sin(angle) * r;
                const len = 2 + intensity * 5;

                ctx.beginPath();
                ctx.moveTo(nx, ny);
                ctx.lineTo(nx + Math.cos(angle) * len, ny + Math.sin(angle) * len);
                ctx.strokeStyle = hsl(pc.h, 55, 52, alpha * 1.5);
                ctx.lineWidth = 0.4;
                ctx.stroke();
            }
        }

        // Rotating scan lines (3 for denser look)
        for (let s = 0; s < 3; s++) {
            const scanAngle = time * 0.35 + s * (Math.PI * 2 / 3);
            const scanLen = radius * 1.5;

            const grad = ctx.createLinearGradient(
                cx, cy,
                cx + Math.cos(scanAngle) * scanLen,
                cy + Math.sin(scanAngle) * scanLen
            );
            grad.addColorStop(0, hsl(pc.h, 80, 60, 0.06 * intensity));
            grad.addColorStop(0.6, hsl(pc.h, 80, 60, 0.015 * intensity));
            grad.addColorStop(1, 'transparent');

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(scanAngle) * scanLen, cy + Math.sin(scanAngle) * scanLen);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 0.6;
            ctx.stroke();
        }
    }

    _renderOuterAura() {
        const { ctx, cx, cy, radius, intensity, time } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        // Dual-color outer aura
        const auraR = radius * 1.8;
        const aura = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, auraR);
        aura.addColorStop(0, 'transparent');
        aura.addColorStop(0.3, hsl(pc.h, 60, 40, 0.012 * intensity));
        aura.addColorStop(0.6, hsl(ac.h, 50, 35, 0.008 * intensity));
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
        ctx.fill();

        // Flickering edge particles (more of them, dual-color)
        if (intensity > 0.2) {
            const count = Math.floor(intensity * 16);
            for (let i = 0; i < count; i++) {
                const angle = time * 0.3 + (i / count) * Math.PI * 2;
                const dist = radius * (0.9 + noise2D(time + i, i * 3) * 0.2);
                const px = cx + Math.cos(angle) * dist;
                const py = cy + Math.sin(angle) * dist;
                const flicker = 0.3 + Math.sin(time * 8 + i * 7) * 0.3;

                const color = i % 2 === 0 ? pc : ac;

                ctx.beginPath();
                ctx.arc(px, py, 1 + intensity * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = hsl(color.h, 90, 70, 0.12 * intensity * flicker);
                ctx.fill();
            }
        }
    }

    // ─── Mood Setter ──────────────────────────────────────────────

    setMood(mood) {
        switch (mood) {
            case 'thinking':
                this.primaryColor = { h: 270, s: 80, l: 60 };
                this.accentColor = { h: 200, s: 90, l: 60 };
                this.energyColor = { h: 300, s: 90, l: 70 };
                break;
            case 'intense':
                this.primaryColor = { h: 15, s: 100, l: 55 };
                this.accentColor = { h: 40, s: 100, l: 65 };
                this.energyColor = { h: 5, s: 100, l: 60 };
                break;
            default:
                this.primaryColor = { h: 35, s: 100, l: 55 };
                this.accentColor = { h: 200, s: 90, l: 60 };
                this.energyColor = { h: 25, s: 100, l: 65 };
        }
    }

    destroy() {
        window.removeEventListener('resize', this._boundResize);
    }
}
