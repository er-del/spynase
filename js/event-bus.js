/**
 * EventBus — Lightweight publish/subscribe event system
 * Used to synchronize all Synapse modules (LLM, audio, visuals)
 */
class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name (e.g., 'state:change', 'token:received')
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => this._listeners.get(event)?.delete(callback);
    }

    /**
     * Subscribe to an event once
     * @param {string} event
     * @param {Function} callback
     */
    once(event, callback) {
        const unsub = this.on(event, (...args) => {
            unsub();
            callback(...args);
        });
        return unsub;
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Event payload
     */
    emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            for (const cb of listeners) {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`[EventBus] Error in '${event}' handler:`, err);
                }
            }
        }
    }

    /**
     * Remove all listeners for an event, or all events
     * @param {string} [event]
     */
    off(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
}

// Singleton instance
const bus = new EventBus();
export default bus;
