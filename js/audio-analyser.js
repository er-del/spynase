/**
 * AudioAnalyser — Web Audio API wrapper for real-time audio analysis
 * Provides amplitude (RMS) and frequency data for visualizations
 */
import bus from './event-bus.js';

class AudioAnalyser {
    constructor() {
        this.ctx = null;
        this.analyser = null;
        this.micSource = null;
        this.micStream = null;
        this.dataArray = null;
        this.freqArray = null;
        this._animFrame = null;
        this._active = false;

        // Simulated amplitude for TTS (since SpeechSynthesis can't route to AnalyserNode)
        this._simulatedAmplitude = 0;
        this._targetSimulated = 0;

        // Listen for TTS boundaries to simulate amplitude
        bus.on('tts:boundary', () => {
            this._targetSimulated = 0.5 + Math.random() * 0.5;
            setTimeout(() => {
                this._targetSimulated *= 0.3;
            }, 120);
        });

        bus.on('tts:start', () => {
            this._targetSimulated = 0.6;
        });

        bus.on('tts:end', () => {
            this._targetSimulated = 0;
            this._simulatedAmplitude = 0;
        });
    }

    /**
     * Initialize the AudioContext (must be called from user gesture)
     */
    async init() {
        if (this.ctx) return;

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;

        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.freqArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    /**
     * Connect to microphone for listening-state visualization
     */
    async connectMicrophone() {
        if (!this.ctx) await this.init();

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.micSource = this.ctx.createMediaStreamSource(this.micStream);
            this.micSource.connect(this.analyser);
            // Don't connect to destination (we don't want to hear ourselves)
            this._active = true;
            return true;
        } catch (err) {
            console.warn('[AudioAnalyser] Microphone access denied:', err);
            return false;
        }
    }

    /**
     * Disconnect microphone
     */
    disconnectMicrophone() {
        if (this.micSource) {
            this.micSource.disconnect();
            this.micSource = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }
        this._active = false;
    }

    /**
     * Get current RMS amplitude [0..1]
     * Uses real mic data when available, simulated data during TTS
     */
    getAmplitude() {
        if (this._active && this.analyser) {
            this.analyser.getByteTimeDomainData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                const v = (this.dataArray[i] - 128) / 128;
                sum += v * v;
            }
            return Math.sqrt(sum / this.dataArray.length);
        }

        // Smooth simulated amplitude
        this._simulatedAmplitude += (this._targetSimulated - this._simulatedAmplitude) * 0.15;
        return this._simulatedAmplitude;
    }

    /**
     * Get frequency data array [0..255] per bin
     * @returns {Uint8Array}
     */
    getFrequencyData() {
        if (this._active && this.analyser) {
            this.analyser.getByteFrequencyData(this.freqArray);
            return this.freqArray;
        }
        return this.freqArray || new Uint8Array(128);
    }

    /**
     * Resume AudioContext (needed after user gesture)
     */
    async resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }
}

const audioAnalyser = new AudioAnalyser();
export default audioAnalyser;
