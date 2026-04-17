/**
 * NetworkController.js — Remote-input controller for multiplayer.
 *
 * Implements the same poll() interface as KeyboardController / InputManager.
 * The MultiplayerScene feeds remote input into this via applyRemoteInput().
 *
 * Simple latest-input model: host is authoritative, so we just need
 * the most recent input from the remote player applied immediately.
 */
(function () {

class NetworkController {
    constructor() {
        this._current = new SMASH.InputState();
    }

    /**
     * Called when a 'remoteInput' message arrives via WebSocket.
     * Immediately applies the input so the next poll() returns it.
     */
    applyRemoteInput(raw) {
        const s = this._current;
        s.moveX   = raw.moveX   || 0;
        s.moveY   = raw.moveY   || 0;
        s.jump    = !!raw.jump;
        s.attack  = !!raw.attack;
        s.special = !!raw.special;
        s.specialHeld = !!raw.specialHeld;
        s.shield  = !!raw.shield;
        s.grab    = !!raw.grab;
    }

    /** Returns the latest remote InputState (one-shot actions reset after read). */
    poll() {
        const out = new SMASH.InputState();
        out.moveX   = this._current.moveX;
        out.moveY   = this._current.moveY;
        out.jump    = this._current.jump;
        out.attack  = this._current.attack;
        out.special = this._current.special;
        out.specialHeld = this._current.specialHeld;
        out.shield  = this._current.shield;
        out.grab    = this._current.grab;

        // Reset one-shot actions so they only fire once
        this._current.jump    = false;
        this._current.attack  = false;
        this._current.special = false;
        this._current.grab    = false;

        return out;
    }
}

SMASH.NetworkController = NetworkController;
})();
