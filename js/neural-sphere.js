/**
 * NeuralSphere — 3D Holographic Contextual Neural Network
 * 
 * Specifically designed to visualize organic, randomized growth.
 * As the user chats with the AI, the context window grows, visibly
 * expanding the sphere and connecting to new points. Once full (or cleared),
 * it compacts inward and restarts.
 */
import {
    lerp, clamp, mapRange, 
    project3D, rotateX, rotateY, rotateZ,
    dist3D, seededRandom, hsl
} from './utils.js';
import bus from './event-bus.js';

// ─── Configuration ────────────────────────────────────────────────
const MAX_NODES = 600;
const MAX_EDGES = 1000;
const MAX_PARTICLES = 600;
const SPHERE_BASE_RADIUS = 200;
const FOV = 600;

const MAX_CONTEXT_TOKENS = 500; // Point at which sphere collapses and resets

export default class NeuralSphere {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Sphere state
        this.time = 0;
        this.rotationY = 0;
        this.rotationX = 0;
        
        // Growth mechanics
        this.contextTokens = 0;
        this.radiusScale = 0; // 0 to 1 scaling based on context

        // Entities
        this.nodes = [];
        this.edges = [];
        this.particles = [];
        this.shockwaves = []; // For the compaction reset effect

        // Visual state
        this.intensity = 0.3;
        this.targetIntensity = 0.3;
        this.state = 'idle';
        this.tokenRate = 0;
        this.activeNodeCount = 20; // Starting core

        // Color palette
        this.primaryColor = { h: 35, s: 100, l: 55 }; // Gold/Orange
        this.accentColor = { h: 200, s: 90, l: 60 };  // Cyan
        
        this._currentPrimary = { ...this.primaryColor };
        this._currentAccent = { ...this.accentColor };

        this._initNodes();

        // Subscriptions
        bus.on('token:received', (data) => this._onToken(data));
        bus.on('state:change', (data) => this._onStateChange(data));
        bus.on('chat:clear', () => this._triggerCompact());

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
    }

    // ─── Initialization ───────────────────────────────────────────

    _initNodes() {
        const rng = seededRandom(42);
        
        for (let i = 0; i < MAX_NODES; i++) {
            // Chaotic organic distribution using clustered random on a sphere surface + interior
            const theta = rng() * Math.PI * 2;
            const phi = Math.acos((rng() * 2) - 1);
            
            // Random distance from center (clusters more dense towards middle but reaches edge)
            const rOffset = Math.pow(rng(), 0.7); // push mostly to outside or middle
            
            const nx = rOffset * Math.sin(phi) * Math.cos(theta);
            const ny = rOffset * Math.cos(phi);
            const nz = rOffset * Math.sin(phi) * Math.sin(theta);
            
            this.nodes.push({
                x: nx, y: ny, z: nz,
                life: 0,
                pulse: 0,
                size: 1.2 + rng() * 2.5,
                colorShift: (rng() > 0.5) ? 0 : 1 // 0 = primary, 1 = accent
            });
        }
        
        // Initial connections for the core (first 20 nodes)
        this.edges = [];
        for (let i = 1; i < this.activeNodeCount; i++) {
            const parent = Math.floor(rng() * i);
            this._addEdge(parent, i);
            if (rng() > 0.5 && i > 2) {
                const p2 = Math.floor(rng() * i);
                if (p2 !== parent) this._addEdge(p2, i);
            }
        }
    }

    _addEdge(fromIdx, toIdx) {
        if (this.edges.length >= MAX_EDGES) {
            this.edges.shift();
        }
        this.edges.push({
            from: fromIdx,
            to: toIdx,
            life: 0,
            growProgress: 0,
            active: true
        });
    }

    _spawnParticle(fromNode, toNode) {
        if (this.particles.length >= MAX_PARTICLES) {
            this.particles.shift();
        }
        this.particles.push({
            from: { ...fromNode },
            to: { ...toNode },
            t: 0,
            speed: 0.6 + Math.random() * 1.8,
            size: 0.5 + Math.random() * 2.0,
            life: 1,
        });
    }

    // ─── Logic Mechanics ──────────────────────────────────────────

    _onToken(data) {
        // Core mechanics: Growth per token
        this.contextTokens++;
        this.tokenRate = data.tokenRate || 10;
        
        // Update visual intensity based on parsing speed
        this.targetIntensity = clamp(mapRange(this.tokenRate, 2, 40, 0.3, 1.0), 0.2, 1.0);

        // Check if context limit reached
        if (this.contextTokens > MAX_CONTEXT_TOKENS) {
            this._triggerCompact();
        } else {
            // Grow the network
            this._growNetwork();
        }
    }
    
    _growNetwork() {
        // Calculate how many nodes should be active based on current context
        const progress = this.contextTokens / MAX_CONTEXT_TOKENS;
        const targetActiveNodes = Math.floor(20 + (MAX_NODES - 20) * progress);
        
        while (this.activeNodeCount < targetActiveNodes && this.activeNodeCount < MAX_NODES) {
            const newNodeIdx = this.activeNodeCount;
            this.nodes[newNodeIdx].pulse = 1.0; // Flash the new node!
            this.nodes[newNodeIdx].life = 0;
            
            // Connect to a random existing active node
            const parentIdx = Math.floor(Math.pow(Math.random(), 2) * this.activeNodeCount); // Bias towards newer nodes or core nodes
            this._addEdge(parentIdx, newNodeIdx);
            
            // 40% chance of a secondary connection for cross-webbing
            if (Math.random() < 0.4) {
                const parentIdx2 = Math.floor(Math.random() * this.activeNodeCount);
                if (parentIdx2 !== parentIdx) this._addEdge(parentIdx2, newNodeIdx);
            }
            
            // Spawn some energy particles immediately to draw attention to new node
            for(let i=0; i<3; i++) {
                this._spawnParticle(this.nodes[parentIdx], this.nodes[newNodeIdx]);
            }
            
            this.activeNodeCount++;
        }
        
        // Randomly pulse existing active nodes and spawn particles across the web
        for (let i = 0; i < 2; i++) {
            const randEdge = this.edges[Math.floor(Math.random() * this.edges.length)];
            if (randEdge && randEdge.active) {
                const fromNode = this.nodes[randEdge.from];
                const toNode = this.nodes[randEdge.to];
                if (fromNode && toNode) {
                    this._spawnParticle(fromNode, toNode);
                    fromNode.pulse = 0.5 + Math.random() * 0.5;
                }
            }
        }
    }

    _triggerCompact() {
        console.log('[NeuralSphere] Context limit reached! Compacting neural network...');
        
        // Reset state
        this.contextTokens = 0;
        
        // Add a massive shockwave
        this.shockwaves.push({
            radius: 0,
            maxRadius: SPHERE_BASE_RADIUS * 2.5,
            life: 1.0
        });
        
        // Visually sever ties
        for(let e of this.edges) {
            e.active = false; 
        }
        
        // Reset active node count back to core cluster
        this.activeNodeCount = 20;
        
        // Immediately regenerate core edges
        this.edges = [];
        for (let i = 1; i < this.activeNodeCount; i++) {
            const parent = Math.floor(Math.random() * i);
            this._addEdge(parent, i);
        }
        
        this.targetIntensity = 0.8; // Brief flash!
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

        // Scale radius smoothly! Core radius + expansion based on context
        const progress = this.contextTokens / MAX_CONTEXT_TOKENS;
        this.radiusScale = lerp(this.radiusScale, progress, dt * 2);
        
        // The sphere grows from 0.4x to 1.3x size as context gets full
        const targetRadius = SPHERE_BASE_RADIUS * (0.4 + this.radiusScale * 0.9);
        this.radius = lerp(this.radius || targetRadius, targetRadius, dt * 4);
        
        this.intensity = lerp(this.intensity, this.targetIntensity, dt * 2);

        // Color transitions
        const cSpeed = dt * 1.5;
        this._currentPrimary.h = lerp(this._currentPrimary.h, this.primaryColor.h, cSpeed);
        this._currentAccent.h = lerp(this._currentAccent.h, this.accentColor.h, cSpeed);

        const rotSpeed = 0.15 + this.intensity * 0.4;
        this.rotationY += dt * rotSpeed;
        this.rotationX = Math.sin(this.time * 0.3) * 0.3; // Gentle wobble

        // Update nodes
        for (let i = 0; i < this.activeNodeCount; i++) {
            const node = this.nodes[i];
            node.life = Math.min(node.life + dt * 2.0, 1);
            node.pulse = Math.max(node.pulse - dt * 2.5, 0);
        }

        // Update edges
        for (let i = this.edges.length - 1; i >= 0; i--) {
            const edge = this.edges[i];
            if (!edge.active) {
                edge.life -= dt * 3; // Fade out rapidly if severed
                if (edge.life <= 0) this.edges.splice(i, 1);
            } else {
                edge.growProgress = Math.min(edge.growProgress + dt * 3, 1);
                edge.life = Math.min(edge.life + dt, 1);
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.t += dt * p.speed;
            p.life -= dt * 0.5;
            if (p.t >= 1 || p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
        
        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.radius += dt * sw.maxRadius * 2.5; // Expand fast
            sw.life -= dt * 1.5;
            if (sw.life <= 0) this.shockwaves.splice(i, 1);
        }

        // Idle particle spawning if speaking/processing
        if (this.state !== 'idle' && this.edges.length > 0) {
            const spawnRate = this.intensity * 0.6;
            if (Math.random() < spawnRate) {
                const edge = this.edges[Math.floor(Math.random() * this.edges.length)];
                if (edge && edge.active) {
                    this._spawnParticle(this.nodes[edge.from], this.nodes[edge.to]);
                }
            }
        }

        this._render();
    }

    // ─── Projection ───────────────────────────────────────────────

    _project(x, y, z) {
        let p = rotateY(x, y, z, this.rotationY);
        p = rotateX(p.x, p.y, p.z, this.rotationX);
        return project3D(p.x * this.radius, p.y * this.radius, p.z * this.radius, FOV, this.cx, this.cy);
    }

    // ─── Main Render ──────────────────────────────────────────────

    _render() {
        const { ctx, w, h, cx, cy, intensity } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        // Dark void background with heavy motion trail smoothing
        ctx.fillStyle = `rgba(5, 5, 12, ${0.15 + intensity * 0.05})`;
        ctx.fillRect(0, 0, w, h);

        // Core ambient glow based strictly on active node radius
        const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius * 1.8);
        bgGlow.addColorStop(0, hsl(pc.h, 60, 25, 0.15 * intensity));
        bgGlow.addColorStop(0.4, hsl(ac.h, 50, 15, 0.05 * intensity));
        bgGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = bgGlow;
        ctx.fillRect(0, 0, w, h);

        // ─── Render layers ────────────
        const drawables = [];
        const projectedNodes = new Array(this.activeNodeCount);

        // 1. Project nodes
        for (let i = 0; i < this.activeNodeCount; i++) {
            const node = this.nodes[i];
            const proj = this._project(node.x, node.y, node.z);
            projectedNodes[i] = proj;
            drawables.push({ type: 'node', index: i, depth: proj.depth, proj, node });
        }

        // 2. Project Edges
        for (const edge of this.edges) {
            const pFrom = projectedNodes[edge.from];
            const pTo = projectedNodes[edge.to];
            if (!pFrom || !pTo) continue;
            drawables.push({ type: 'edge', depth: (pFrom.depth + pTo.depth) / 2, pFrom, pTo, edge });
        }

        // 3. Project Stream Particles
        for (const p of this.particles) {
            const curX = lerp(p.from.x, p.to.x, p.t);
            const curY = lerp(p.from.y, p.to.y, p.t);
            const curZ = lerp(p.from.z, p.to.z, p.t);
            const proj = this._project(curX, curY, curZ);
            drawables.push({ type: 'particle', depth: proj.depth, proj, particle: p });
        }

        // Depth sort back-to-front
        drawables.sort((a, b) => b.depth - a.depth);

        // 4. Render!
        for (const d of drawables) {
            if (d.type === 'edge') this._renderEdge(d);
            if (d.type === 'particle') this._renderParticle(d);
            if (d.type === 'node') this._renderNode(d);
        }
        
        // 5. Render Compaction Shockwaves
        this._renderShockwaves();
    }

    _renderEdge({ pFrom, pTo, edge }) {
        const { ctx, intensity } = this;
        const pc = this._currentPrimary;
        
        // Dynamic depth fading
        const fade = clamp(mapRange(pFrom.depth, -this.radius, this.radius, 1.0, 0.05), 0.05, 1.0);
        if (fade < 0.05) return;

        const maxLen = dist3D(pFrom.x, pFrom.y, pFrom.z, pTo.x, pTo.y, pTo.z);
        const curLen = maxLen * edge.growProgress;
        if (curLen <= 0) return;

        const lx = lerp(pFrom.x, pTo.x, edge.growProgress);
        const ly = lerp(pFrom.y, pTo.y, edge.growProgress);

        const a = fade * edge.life * (0.15 + intensity * 0.3);
        
        // Nervous chaotic twitch
        const twitchX = (Math.random() - 0.5) * 1.5 * intensity * fade;
        const twitchY = (Math.random() - 0.5) * 1.5 * intensity * fade;

        ctx.beginPath();
        ctx.moveTo(pFrom.x, pFrom.y);
        ctx.lineTo(lx + twitchX, ly + twitchY);
        ctx.strokeStyle = hsl(pc.h, 70, 60, a);
        ctx.lineWidth = 0.5 * pFrom.scale;
        ctx.stroke();
        
        // Intense glow if it's very active or newly grown
        if (edge.growProgress < 1 && a > 0.1) {
            ctx.beginPath();
            ctx.moveTo(pFrom.x, pFrom.y);
            ctx.lineTo(lx, ly);
            ctx.strokeStyle = hsl(pc.h, 100, 80, a * 1.5);
            ctx.lineWidth = 1.5 * pFrom.scale;
            ctx.stroke();
        }
    }

    _renderNode({ proj, node }) {
        const { ctx, intensity } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;
        const cColor = node.colorShift === 0 ? pc : ac;

        const fade = clamp(mapRange(proj.depth, -this.radius, this.radius, 1.0, 0.1), 0.1, 1.0);
        if (fade < 0.05) return;

        // Size pulses with network activity and its own lifecycle
        const scale = proj.scale * node.size * node.life;
        const curSize = scale * (1 + node.pulse * 2.0);
        
        if (curSize < 0.5) return;

        const a = fade * (0.6 + intensity * 0.4 + node.pulse);

        // Core point
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, curSize, 0, Math.PI * 2);
        ctx.fillStyle = hsl(cColor.h, 100, 80, a);
        ctx.fill();

        // Glow
        if (node.pulse > 0 || intensity > 0.4 || fade > 0.8) {
            const gSize = curSize * (3 + node.pulse * 4);
            const grad = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, gSize);
            grad.addColorStop(0, hsl(cColor.h, 90, 60, a * 0.6));
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(proj.x - gSize, proj.y - gSize, gSize * 2, gSize * 2);
        }
    }

    _renderParticle({ proj, particle }) {
        const { ctx, time } = this;
        const pc = this._currentPrimary;
        const ac = this._currentAccent;

        const fade = clamp(mapRange(proj.depth, -this.radius, this.radius, 1.0, 0.1), 0.1, 1.0);
        if (fade < 0.05) return;

        const pAlpha = particle.life * fade * 0.9;
        const pSize = particle.size * proj.scale;
        
        // Fast oscillating colors while traversing
        const hShift = Math.sin(time * 10) > 0 ? pc.h : ac.h;

        ctx.beginPath();
        ctx.arc(proj.x, proj.y, pSize, 0, Math.PI * 2);
        ctx.fillStyle = hsl(hShift, 100, 75, pAlpha);
        ctx.fill();
        
        // Flare
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, pSize * 3, 0, Math.PI * 2);
        ctx.fillStyle = hsl(hShift, 90, 60, pAlpha * 0.3);
        ctx.fill();
    }
    
    _renderShockwaves() {
        const { ctx, w, cx, cy } = this;
        const pc = this._currentPrimary;
        
        for (const sw of this.shockwaves) {
            const easeOut = 1 - Math.pow(1 - sw.life, 3); // Ease out
            
            // Distort sphere radius drastically
            ctx.beginPath();
            ctx.arc(cx, cy, sw.radius, 0, Math.PI * 2);
            ctx.strokeStyle = hsl(pc.h, 100, 70, sw.life * 0.8);
            ctx.lineWidth = 1 + sw.life * 10;
            ctx.stroke();
            
            // Flash screen
            if (sw.life > 0.8) {
                const flashAlpha = (sw.life - 0.8) * 5 * 0.15;
                ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
                ctx.fillRect(0, 0, w, this.h);
            }
        }
    }
}
