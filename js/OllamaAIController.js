/**
 * OllamaAIController.js — Local LLM-driven CPU via server-side Ollama proxy.
 */
(function() {
const InputState = SMASH.InputState;

class OllamaAIController {
    constructor(port, difficulty) {
        this.port = port;
        this.difficulty = Math.max(1, Math.min(10, difficulty || 5));

        this._fighters = [];
        this._self = null;
        this._stage = null;
        this._projectiles = [];

        this._lastInput = new InputState();
        this._pending = false;
        this._frameCounter = 0;
        this._neutralFrames = 0;
        this._online = false;
        this._lastSuccessAt = 0;
        this._lastError = '';

        // Lower difficulties query less often so they feel slower/weaker.
        this._decisionInterval = Math.max(4, 18 - this.difficulty);

        // Fallback keeps gameplay active when Ollama is unavailable/slow.
        this._fallback = new SMASH.AIController(this.port, this.difficulty);
    }

    setContext(fighters, stage, projectiles) {
        this._fighters = fighters || [];
        this._stage = stage || null;
        this._projectiles = projectiles || [];
        this._self = this._fighters.find(f => f.port === this.port) || null;
        if (this._fallback && typeof this._fallback.setContext === 'function') {
            this._fallback.setContext(this._fighters, this._stage, this._projectiles);
        }
    }

    poll() {
        const me = this._self;
        if (!me || !me.isAlive) return new InputState();

        this._frameCounter++;
        if (!this._pending && this._frameCounter % this._decisionInterval === 0) {
            const enemy = this._pickEnemy(me);
            const payload = this._buildPayload(me, enemy);
            this._requestDecision(payload);
        }

        const llmInput = this._cloneInput(this._lastInput);
        if (this._isNeutral(llmInput)) {
            this._neutralFrames++;
        } else {
            this._neutralFrames = 0;
        }

        // If model output is repeatedly neutral, fall back to scripted AI.
        if (this._neutralFrames >= 8 && this._fallback) {
            return this._fallback.poll();
        }
        return llmInput;
    }

    _pickEnemy(me) {
        const enemies = this._fighters.filter(f => this._isEnemy(me, f) && f.isAlive);
        if (!enemies.length) return null;

        return enemies.reduce((a, b) => {
            const da = Math.hypot(a.x - me.x, a.y - me.y);
            const db = Math.hypot(b.x - me.x, b.y - me.y);
            return da < db ? a : b;
        });
    }

    _isEnemy(me, other) {
        if (!me || !other) return false;
        if (other.port === this.port) return false;

        const myTeam = Number.isFinite(me.team) ? me.team : -1;
        const otherTeam = Number.isFinite(other.team) ? other.team : -1;
        if (myTeam >= 0 && otherTeam >= 0) {
            return myTeam !== otherTeam;
        }
        return true;
    }

    _buildPayload(me, enemy) {
        const bz = this._stage && this._stage.blastZone ? this._stage.blastZone : null;
        return {
            difficulty: this.difficulty,
            ai_pos: {
                x: Number(me.x || 0),
                y: Number(me.y || 0),
                vx: Number(me.vx || 0),
                vy: Number(me.vy || 0),
            },
            enemy_pos: enemy ? {
                x: Number(enemy.x || 0),
                y: Number(enemy.y || 0),
                vx: Number(enemy.vx || 0),
                vy: Number(enemy.vy || 0),
            } : null,
            ai_damage: Number(me.damagePercent || 0),
            enemy_damage: enemy ? Number(enemy.damagePercent || 0) : 0,
            ai_stocks: Number(me.stocks || 0),
            enemy_stocks: enemy ? Number(enemy.stocks || 0) : 0,
            ai_grounded: !!me.grounded,
            enemy_airborne: enemy ? !!enemy.isAirborne : false,
            stage_bounds: bz ? {
                left: Number(bz.left || 0),
                right: Number(bz.right || 0),
                top: Number(bz.top || 0),
                bottom: Number(bz.bottom || 0),
            } : null,
        };
    }

    async _requestDecision(payload) {
        this._pending = true;
        try {
            const res = await fetch('/api/ollama-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const out = await res.json();
            if (out && out.ok === false) {
                this._online = false;
                this._lastError = out.error || 'ollama_error';
            } else {
                this._online = true;
                this._lastSuccessAt = performance.now();
                this._lastError = '';
            }
            this._lastInput = this._toInputState(out && out.action ? out.action : out);
        } catch {
            // Keep prior input; if the backend is down, AI will still move from stale actions.
            this._online = false;
            this._lastError = 'request_failed';
        } finally {
            this._pending = false;
        }
    }

    _toInputState(action) {
        const inp = new InputState();
        if (!action || typeof action !== 'object') return inp;

        const mx = Number(action.move_x);
        const my = Number(action.move_y);
        inp.moveX = Number.isFinite(mx) ? Math.max(-1, Math.min(1, mx)) : 0;
        inp.moveY = Number.isFinite(my) ? Math.max(-1, Math.min(1, my)) : 0;

        inp.jump = !!action.jump;
        inp.attack = !!action.attack;
        inp.special = !!action.special;
        inp.shield = !!action.shield;
        inp.grab = !!action.grab;
        return inp;
    }

    _cloneInput(src) {
        const out = new InputState();
        out.moveX = src.moveX;
        out.moveY = src.moveY;
        out.jump = src.jump;
        out.attack = src.attack;
        out.special = src.special;
        out.specialHeld = !!src.specialHeld;
        out.shield = src.shield;
        out.grab = src.grab;
        return out;
    }

    _isNeutral(inp) {
        return inp.moveX === 0 && inp.moveY === 0 &&
            !inp.jump && !inp.attack && !inp.special && !inp.shield && !inp.grab;
    }

    getStatus() {
        return {
            online: this._online,
            pending: this._pending,
            lastSuccessAt: this._lastSuccessAt,
            lastError: this._lastError,
        };
    }
}

SMASH.OllamaAIController = OllamaAIController;
})();
