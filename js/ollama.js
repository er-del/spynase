/**
 * Ollama — Local LLM streaming client
 * Connects to Ollama HTTP API at localhost:11434
 * Streams tokens via NDJSON and emits events through EventBus
 */
import bus from './event-bus.js';

const OLLAMA_BASE = ''; // Proxied via server.js

class OllamaClient {
    constructor() {
        this.model = null;
        this.isConnected = false;
        this.isGenerating = false;
        this.conversationHistory = [];
        this.abortController = null;

        // Token rate tracking
        this._tokenCount = 0;
        this._tokenStartTime = 0;
        this._lastTokenTime = 0;
    }

    /**
     * Check if Ollama is running and list available models
     * @returns {Promise<string[]>} Array of model names
     */
    async checkConnection() {
        try {
            const res = await fetch(`${OLLAMA_BASE}/api/tags`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.isConnected = true;
            const models = (data.models || []).map(m => m.name);
            bus.emit('ollama:connected', { models });
            return models;
        } catch (err) {
            this.isConnected = false;
            bus.emit('ollama:disconnected', { error: err.message });
            return [];
        }
    }

    /**
     * Set the active model
     * @param {string} model
     */
    setModel(model) {
        this.model = model;
        bus.emit('ollama:model-changed', { model });
    }

    /**
     * Send a message and stream the response
     * @param {string} userMessage
     * @returns {Promise<string>} Full response text
     */
    async chat(userMessage) {
        if (!this.model) throw new Error('No model selected');
        if (this.isGenerating) {
            this.abort();
            await new Promise(r => setTimeout(r, 100));
        }

        this.isGenerating = true;
        this.abortController = new AbortController();

        // Add user message to history
        this.conversationHistory.push({ role: 'user', content: userMessage });

        // Track token rate
        this._tokenCount = 0;
        this._tokenStartTime = performance.now();
        this._lastTokenTime = this._tokenStartTime;

        bus.emit('state:change', { state: 'processing' });

        let fullResponse = '';

        try {
            const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
                method: 'POST',
                signal: this.abortController.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: this.conversationHistory,
                    stream: true,
                }),
            });

            if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.message?.content) {
                            const token = json.message.content;
                            fullResponse += token;
                            this._tokenCount++;

                            const now = performance.now();
                            const tokenRate = this._tokenCount / ((now - this._tokenStartTime) / 1000);
                            const tokenGap = now - this._lastTokenTime;
                            this._lastTokenTime = now;

                            bus.emit('token:received', {
                                token,
                                fullText: fullResponse,
                                index: this._tokenCount,
                                tokenRate, // tokens per second
                                tokenGap,  // ms since last token
                            });

                            // Transition to speaking on first token
                            if (this._tokenCount === 1) {
                                bus.emit('state:change', { state: 'speaking' });
                            }
                        }

                        if (json.done) {
                            bus.emit('generation:complete', {
                                fullText: fullResponse,
                                totalTokens: this._tokenCount,
                                duration: performance.now() - this._tokenStartTime,
                            });
                        }
                    } catch (e) {
                        // Skip malformed JSON lines
                    }
                }
            }

            // Add assistant response to history
            this.conversationHistory.push({ role: 'assistant', content: fullResponse });

        } catch (err) {
            if (err.name === 'AbortError') {
                bus.emit('generation:aborted', {});
            } else {
                console.error('[Ollama] Stream error:', err);
                bus.emit('ollama:error', { error: err.message });
                bus.emit('state:change', { state: 'idle' });
            }
        } finally {
            this.isGenerating = false;
            this.abortController = null;
        }

        return fullResponse;
    }

    /**
     * Abort current generation
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
        bus.emit('ollama:history-cleared', {});
    }
}

const ollama = new OllamaClient();
export default ollama;
