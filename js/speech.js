/**
 * Speech — Speech-to-Text and Text-to-Speech controller
 * Uses Web Speech API with graceful fallback
 */
import bus from './event-bus.js';

class SpeechController {
    constructor() {
        // Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognitionAvailable = !!SpeechRecognition;
        this.isListening = false;

        if (this.recognitionAvailable) {
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'en-US';
            this.recognition.continuous = false;
            this.recognition.interimResults = true;

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        finalTranscript += result[0].transcript;
                    } else {
                        interimTranscript += result[0].transcript;
                    }
                }

                if (interimTranscript) {
                    bus.emit('speech:interim', { text: interimTranscript });
                }

                if (finalTranscript) {
                    bus.emit('speech:final', { text: finalTranscript });
                    this.isListening = false;
                }
            };

            this.recognition.onerror = (event) => {
                console.warn('[Speech] Recognition error:', event.error);
                this.isListening = false;
                bus.emit('speech:error', { error: event.error });
                if (event.error !== 'aborted') {
                    bus.emit('state:change', { state: 'idle' });
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
            };
        }

        // Speech Synthesis
        this.synth = window.speechSynthesis;
        this.isSpeaking = false;
        this._currentUtterance = null;
    }

    /**
     * Start listening for speech input
     */
    startListening() {
        if (!this.recognitionAvailable) {
            bus.emit('speech:error', { error: 'Speech Recognition not available in this browser' });
            return false;
        }

        if (this.isListening) {
            this.stopListening();
            return false;
        }

        // Stop TTS if playing
        if (this.isSpeaking) {
            this.stopSpeaking();
        }

        try {
            this.recognition.start();
            this.isListening = true;
            bus.emit('state:change', { state: 'listening' });
            return true;
        } catch (err) {
            console.error('[Speech] Failed to start recognition:', err);
            return false;
        }
    }

    /**
     * Stop listening
     */
    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.abort();
            this.isListening = false;
        }
    }

    /**
     * Speak text using TTS
     * @param {string} text
     * @returns {Promise<void>} Resolves when speech ends
     */
    speak(text) {
        return new Promise((resolve) => {
            if (!this.synth) {
                resolve();
                return;
            }

            // Cancel any ongoing speech
            this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Try to pick a good voice
            const voices = this.synth.getVoices();
            const preferred = voices.find(v =>
                v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha')
            );
            if (preferred) utterance.voice = preferred;

            this._currentUtterance = utterance;
            this.isSpeaking = true;

            utterance.onstart = () => {
                bus.emit('tts:start', {});
            };

            utterance.onboundary = (event) => {
                // Emit word boundaries for simulated amplitude
                bus.emit('tts:boundary', {
                    charIndex: event.charIndex,
                    charLength: event.charLength,
                    name: event.name,
                });
            };

            utterance.onend = () => {
                this.isSpeaking = false;
                this._currentUtterance = null;
                bus.emit('tts:end', {});
                bus.emit('state:change', { state: 'idle' });
                resolve();
            };

            utterance.onerror = (event) => {
                this.isSpeaking = false;
                this._currentUtterance = null;
                console.warn('[Speech] TTS error:', event.error);
                bus.emit('state:change', { state: 'idle' });
                resolve();
            };

            this.synth.speak(utterance);
        });
    }

    /**
     * Stop TTS
     */
    stopSpeaking() {
        if (this.synth) {
            this.synth.cancel();
            this.isSpeaking = false;
            this._currentUtterance = null;
        }
    }

    /**
     * Check if STT is available
     */
    get canListen() {
        return this.recognitionAvailable;
    }
}

const speech = new SpeechController();
export default speech;
