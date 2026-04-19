/**
 * App — Main application controller & state machine
 * 
 * States: IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
 * Modes: CHAT (default) ↔ VOICE (fullscreen)
 * 
 * Orchestrates all modules: Ollama, Speech, Audio, VoiceOrb, NeuralSphere
 */
import bus from './event-bus.js';
import ollama from './ollama.js';
import speech from './speech.js';
import audioAnalyser from './audio-analyser.js';
import VoiceOrb from './voice-orb.js';
import NeuralSphere from './neural-sphere.js';

class SynapseApp {
    constructor() {
        // State
        this.state = 'idle'; // idle | listening | processing | speaking
        this.mode = 'chat';  // chat | voice
        this.isVoiceMode = false;

        // DOM refs
        this.dom = {};

        // Visualizations
        this.voiceOrb = null;
        this.neuralSphere = null;
        this.voiceSphere = null; // Separate sphere for voice mode

        // Token accumulator for TTS
        this._responseBuffer = '';
        this._sentenceQueue = [];
        this._isTTSSpeaking = false;

        // Animation
        this._lastFrame = 0;
        this._animFrame = null;

        // Init
        this._cacheDom();
        this._initVisualizations();
        this._bindEvents();
        this._connectOllama();
        this._startAnimation();
    }

    // ─── DOM ──────────────────────────────────────────────────────
    _cacheDom() {
        this.dom = {
            // Header
            modelSelect: document.getElementById('model-select'),
            voiceModeBtn: document.getElementById('voice-mode-btn'),
            clearBtn: document.getElementById('clear-btn'),

            // Chat panel
            orbCanvas: document.getElementById('orb-canvas'),
            orbStateLabel: document.getElementById('orb-state-label'),
            chatMessages: document.getElementById('chat-messages'),
            chatInput: document.getElementById('chat-input'),
            sendBtn: document.getElementById('send-btn'),
            micBtn: document.getElementById('mic-btn'),

            // Graph panel
            graphCanvas: document.getElementById('graph-canvas'),
            graphStats: document.getElementById('graph-stats'),

            // Voice mode
            voiceOverlay: document.getElementById('voice-mode-overlay'),
            voiceSphereCanvas: document.getElementById('voice-sphere-canvas'),
            voiceMicBtn: document.getElementById('voice-mic-btn'),
            voiceEndBtn: document.getElementById('voice-end-btn'),
            voiceTranscript: document.getElementById('voice-transcript'),
            voiceStatus: document.getElementById('voice-status'),

            // Status bar
            statusDot: document.getElementById('status-dot'),
            statusText: document.getElementById('status-text'),
            modelInfoText: document.getElementById('model-info'),
            tokenRateText: document.getElementById('token-rate'),
        };
    }

    // ─── Visualizations ───────────────────────────────────────────
    _initVisualizations() {
        this.voiceOrb = new VoiceOrb(this.dom.orbCanvas);
        this.neuralSphere = new NeuralSphere(this.dom.graphCanvas);
        this.voiceSphere = new NeuralSphere(this.dom.voiceSphereCanvas);
    }

    // ─── Event Listeners ──────────────────────────────────────────
    _bindEvents() {
        // Chat input
        this.dom.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendMessage();
            }
        });

        this.dom.sendBtn.addEventListener('click', () => this._sendMessage());

        // Mic button (chat mode)
        this.dom.micBtn.addEventListener('click', async () => {
            await audioAnalyser.init();
            await audioAnalyser.resume();
            if (this.state === 'listening') {
                speech.stopListening();
                this._setState('idle');
            } else {
                await audioAnalyser.connectMicrophone();
                speech.startListening();
            }
        });

        // Voice mode toggle
        this.dom.voiceModeBtn.addEventListener('click', () => this._enterVoiceMode());

        // Voice mode mic
        this.dom.voiceMicBtn.addEventListener('click', async () => {
            await audioAnalyser.init();
            await audioAnalyser.resume();
            if (this.state === 'listening') {
                speech.stopListening();
                this._setState('idle');
            } else {
                await audioAnalyser.connectMicrophone();
                speech.startListening();
            }
        });

        // Voice mode exit
        this.dom.voiceEndBtn.addEventListener('click', () => this._exitVoiceMode());

        // ESC to exit voice mode
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVoiceMode) {
                this._exitVoiceMode();
            }
        });

        // Clear history
        this.dom.clearBtn.addEventListener('click', () => {
            ollama.clearHistory();
            this.dom.chatMessages.innerHTML = '';
            this._addSystemMessage('Conversation cleared.');
        });

        // Model select
        this.dom.modelSelect.addEventListener('change', (e) => {
            ollama.setModel(e.target.value);
        });

        // ─── EventBus listeners ───────────────────────────────────

        // State changes
        bus.on('state:change', (data) => this._setState(data.state));

        // Speech recognition results
        bus.on('speech:final', (data) => {
            audioAnalyser.disconnectMicrophone();
            this._handleUserInput(data.text);
        });

        bus.on('speech:interim', (data) => {
            if (this.isVoiceMode) {
                this.dom.voiceTranscript.textContent = data.text;
            }
        });

        // Token streaming
        bus.on('token:received', (data) => {
            this._updateStreamingMessage(data.token);
            this._updateTokenRate(data.tokenRate);
            this._accumulateForTTS(data.token);
        });

        // Generation complete
        bus.on('generation:complete', (data) => {
            this._finalizeMessage();
            this._flushTTS();
        });

        // Ollama events
        bus.on('ollama:connected', (data) => {
            this.dom.statusDot.className = 'status-dot connected';
            this.dom.statusText.textContent = 'Connected to Ollama';
            this._populateModels(data.models);
        });

        bus.on('ollama:disconnected', () => {
            this.dom.statusDot.className = 'status-dot error';
            this.dom.statusText.textContent = 'Ollama not found';
        });

        bus.on('ollama:error', (data) => {
            this._addSystemMessage(`Error: ${data.error}`);
        });

        // TTS events
        bus.on('tts:end', () => {
            if (!this._sentenceQueue.length && !ollama.isGenerating) {
                this._setState('idle');
            }
        });
    }

    // ─── Ollama Connection ────────────────────────────────────────
    async _connectOllama() {
        const models = await ollama.checkConnection();
        if (models.length === 0) {
            this._addSystemMessage('⚠ Could not connect to Ollama. Make sure it\'s running on localhost:11434.');
        } else {
            this._addSystemMessage(`Connected. ${models.length} model(s) available. Select a model and start chatting.`);
        }
    }

    _populateModels(models) {
        this.dom.modelSelect.innerHTML = '<option value="">Select model...</option>';
        for (const model of models) {
            const opt = document.createElement('option');
            opt.value = model;
            opt.textContent = model;
            this.dom.modelSelect.appendChild(opt);
        }

        // Auto-select first model
        if (models.length > 0) {
            this.dom.modelSelect.value = models[0];
            ollama.setModel(models[0]);
            this.dom.modelInfoText.textContent = `Model: ${models[0]}`;
        }
    }

    // ─── State Machine ────────────────────────────────────────────
    _setState(newState) {
        if (newState === this.state && newState !== 'idle') return;
        this.state = newState;

        // Update orb
        this.voiceOrb.setState(newState);

        // Update UI state labels
        this.dom.orbStateLabel.textContent = newState.toUpperCase();
        this.dom.orbStateLabel.dataset.state = newState;

        // Mic button state
        this.dom.micBtn.classList.toggle('active', newState === 'listening');
        this.dom.voiceMicBtn.classList.toggle('active', newState === 'listening');

        // Send button state
        this.dom.sendBtn.disabled = (newState === 'processing' || newState === 'speaking');

        // Voice mode status
        if (this.isVoiceMode) {
            const statusMessages = {
                idle: 'Tap the microphone to speak',
                listening: 'Listening...',
                processing: 'Thinking...',
                speaking: '',
            };
            this.dom.voiceStatus.textContent = statusMessages[newState] || '';
        }

        // Neural sphere mood
        if (newState === 'processing') {
            this.neuralSphere.setMood('thinking');
            this.voiceSphere.setMood('thinking');
        } else if (newState === 'speaking') {
            this.neuralSphere.setMood('intense');
            this.voiceSphere.setMood('intense');
        } else {
            this.neuralSphere.setMood('calm');
            this.voiceSphere.setMood('calm');
        }
    }

    // ─── Voice Mode ───────────────────────────────────────────────
    _enterVoiceMode() {
        this.isVoiceMode = true;
        this.dom.voiceOverlay.classList.add('active');
        this.dom.voiceModeBtn.classList.add('active');
        this.dom.voiceTranscript.textContent = '';
        this.dom.voiceStatus.textContent = 'Tap the microphone to speak';

        // Trigger resize for voice sphere
        setTimeout(() => {
            this.voiceSphere._resize();
        }, 100);
    }

    _exitVoiceMode() {
        this.isVoiceMode = false;
        this.dom.voiceOverlay.classList.remove('active');
        this.dom.voiceModeBtn.classList.remove('active');

        // Stop listening if active
        if (this.state === 'listening') {
            speech.stopListening();
            audioAnalyser.disconnectMicrophone();
            this._setState('idle');
        }
    }

    // ─── Message Handling ─────────────────────────────────────────
    async _sendMessage() {
        const text = this.dom.chatInput.value.trim();
        if (!text || this.state === 'processing' || this.state === 'speaking') return;
        this.dom.chatInput.value = '';
        this._handleUserInput(text);
    }

    async _handleUserInput(text) {
        if (!ollama.model) {
            this._addSystemMessage('Please select a model first.');
            return;
        }

        // Stop any TTS
        speech.stopSpeaking();
        this._sentenceQueue = [];
        this._responseBuffer = '';

        // Add user message
        this._addMessage('user', text);

        if (this.isVoiceMode) {
            this.dom.voiceTranscript.textContent = '';
        }

        // Create streaming assistant message
        this._createStreamingMessage();

        // Start generation
        await ollama.chat(text);
    }

    _addMessage(role, content) {
        const msg = document.createElement('div');
        msg.className = `message message--${role}`;
        msg.innerHTML = `
            <div class="message__role">${role === 'user' ? 'You' : 'Synapse'}</div>
            <div class="message__content">${this._escapeHtml(content)}</div>
        `;
        this.dom.chatMessages.appendChild(msg);
        this._scrollChat();
    }

    _addSystemMessage(text) {
        const msg = document.createElement('div');
        msg.className = 'message message--assistant';
        msg.innerHTML = `
            <div class="message__role">System</div>
            <div class="message__content" style="opacity:0.6;font-style:italic">${text}</div>
        `;
        this.dom.chatMessages.appendChild(msg);
        this._scrollChat();
    }

    _createStreamingMessage() {
        this._streamingMsg = document.createElement('div');
        this._streamingMsg.className = 'message message--assistant';
        this._streamingMsg.innerHTML = `
            <div class="message__role">Synapse</div>
            <div class="message__content message__content--streaming"></div>
        `;
        this.dom.chatMessages.appendChild(this._streamingMsg);
        this._streamingContent = this._streamingMsg.querySelector('.message__content');
        this._fullResponseText = '';
    }

    _updateStreamingMessage(token) {
        if (!this._streamingContent) return;
        this._fullResponseText += token;
        this._streamingContent.textContent = this._fullResponseText;

        // Update voice mode transcript
        if (this.isVoiceMode) {
            // Show last ~200 chars
            const display = this._fullResponseText.length > 200
                ? '...' + this._fullResponseText.slice(-200)
                : this._fullResponseText;
            this.dom.voiceTranscript.textContent = display;
        }

        this._scrollChat();
    }

    _finalizeMessage() {
        if (this._streamingContent) {
            this._streamingContent.classList.remove('message__content--streaming');
        }
        this._streamingContent = null;
        this._streamingMsg = null;
    }

    // ─── TTS Accumulator ──────────────────────────────────────────
    _accumulateForTTS(token) {
        this._responseBuffer += token;

        // Check for sentence boundaries
        const sentenceEnders = /[.!?]\s/;
        if (sentenceEnders.test(this._responseBuffer)) {
            const sentences = this._responseBuffer.split(sentenceEnders);
            // Keep the last incomplete sentence in the buffer
            this._responseBuffer = sentences.pop() || '';

            for (const sentence of sentences) {
                const trimmed = sentence.trim();
                if (trimmed.length > 2) {
                    this._sentenceQueue.push(trimmed);
                }
            }

            this._processTTSQueue();
        }
    }

    _flushTTS() {
        const remaining = this._responseBuffer.trim();
        if (remaining.length > 2) {
            this._sentenceQueue.push(remaining);
        }
        this._responseBuffer = '';
        this._processTTSQueue();
    }

    async _processTTSQueue() {
        if (this._isTTSSpeaking || this._sentenceQueue.length === 0) return;
        this._isTTSSpeaking = true;

        while (this._sentenceQueue.length > 0) {
            const sentence = this._sentenceQueue.shift();
            await speech.speak(sentence);
        }

        this._isTTSSpeaking = false;
    }

    // ─── Token Rate Display ───────────────────────────────────────
    _updateTokenRate(rate) {
        if (this.dom.tokenRateText) {
            this.dom.tokenRateText.textContent = `${rate.toFixed(1)} tok/s`;
        }
        if (this.dom.graphStats) {
            this.dom.graphStats.innerHTML =
                `Nodes: ${this.neuralSphere.activeNodeIndex}<br>` +
                `Intensity: ${(this.neuralSphere.intensity * 100).toFixed(0)}%<br>` +
                `${rate.toFixed(1)} tok/s`;
        }
    }

    // ─── Animation Loop ───────────────────────────────────────────
    _startAnimation() {
        this._lastFrame = performance.now();
        this._tick();
    }

    _tick() {
        const now = performance.now();
        const dt = Math.min((now - this._lastFrame) / 1000, 0.05); // Cap at 50ms
        this._lastFrame = now;

        // Get audio amplitude
        const amplitude = audioAnalyser.getAmplitude();

        // Update chat mode visuals
        this.voiceOrb.update(dt, amplitude);
        this.neuralSphere.update(dt);

        // Update voice mode visuals if active
        if (this.isVoiceMode) {
            this.voiceSphere.update(dt);
        }

        this._animFrame = requestAnimationFrame(() => this._tick());
    }

    // ─── Helpers ──────────────────────────────────────────────────
    _scrollChat() {
        const el = this.dom.chatMessages;
        el.scrollTop = el.scrollHeight;
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        cancelAnimationFrame(this._animFrame);
        this.voiceOrb?.destroy();
        this.neuralSphere?.destroy();
        this.voiceSphere?.destroy();
    }
}

// ─── Bootstrap ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    window.synapse = new SynapseApp();
});
