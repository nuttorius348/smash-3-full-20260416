/**
 * DraftScene.js — Draft pick screen for Draft game mode.
 *
 * Two players take turns drafting 8 characters each (snake draft).
 * Pick order: P1, P2, P2, P1, P1, P2, P2, P1, P1, P2, P2, P1, P1, P2, P2, P1
 * After all 16 characters are drafted, launches the match.
 */
(function () {
const S = SMASH.Settings;

function getSelectableKeys() {
    if (SMASH.Unlocks && typeof SMASH.Unlocks.getSelectableCharacterKeys === 'function') {
        return SMASH.Unlocks.getSelectableCharacterKeys();
    }
    return typeof SMASH.getCharacterKeys === 'function' ? SMASH.getCharacterKeys() : [];
}

// Snake draft order for 16 picks (0 = P1, 1 = P2)
const DRAFT_ORDER = [0,1,1,0, 0,1,1,0, 0,1,1,0, 0,1,1,0];

class DraftScene {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} deviceMgr
     * @param {object} options — { p1Config, p2Config, stageKey, onDone, onBack }
     *   p1Config: { type:'human'|'ai', level?, deviceConfig? }
     *   p2Config: { type:'human'|'ai', level?, deviceConfig? }
     */
    constructor(canvas, deviceMgr, options) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.deviceMgr = deviceMgr;

        this._p1Cfg = options.p1Config || { type: 'human' };
        this._p2Cfg = options.p2Config || { type: 'ai', level: 5 };
        this._stageKey = options.stageKey || 'battlefield';
        this._onDone = options.onDone || null; // callback(p1Queue, p2Queue, p1Cfg, p2Cfg)
        this._onBack = options.onBack || null;

        // All character keys
        this._allKeys = getSelectableKeys();

        // Draft state
        this._available  = [...this._allKeys]; // pool
        this._p1Queue    = []; // drafted characters for P1
        this._p2Queue    = []; // drafted characters for P2
        this._pickIdx    = 0;  // current pick index into DRAFT_ORDER
        this._cursorIdx  = 0;  // cursor position in available pool
        this._phase      = 'drafting'; // 'drafting' | 'done'

        // AI auto-pick timer (frames)
        this._aiTimer = 0;
        this._AI_DELAY = 30; // half second delay for AI picks

        // Input
        this._mk  = {};
        this._mkp = {};
        this._onKD = e => { this._mk[e.code] = true; };
        this._onKU = e => { this._mk[e.code] = false; };
        window.addEventListener('keydown', this._onKD);
        window.addEventListener('keyup',   this._onKU);

        this._running = false;
        this._raf     = null;
    }

    _jp(code) { return !!this._mk[code] && !this._mkp[code]; }

    start() {
        this._running = true;
        this._loop(performance.now());
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        window.removeEventListener('keydown', this._onKD);
        window.removeEventListener('keyup',   this._onKU);
    }

    _loop(now) {
        if (!this._running) return;
        this._update();
        this._render();
        this._mkp = Object.assign({}, this._mk);
        this._raf = requestAnimationFrame(t => this._loop(t));
    }

    // ─── Which player picks this turn? ──────────────────────────
    _currentPicker() {
        if (this._pickIdx >= DRAFT_ORDER.length) return -1;
        return DRAFT_ORDER[this._pickIdx]; // 0=P1, 1=P2
    }

    _isCurrentPickerAI() {
        const picker = this._currentPicker();
        if (picker === 0) return this._p1Cfg.type === 'ai';
        if (picker === 1) return this._p2Cfg.type === 'ai';
        return false;
    }

    // ─── Update ─────────────────────────────────────────────────
    _update() {
        if (this._phase === 'done') return;

        // Escape → back
        if (this._jp('Escape')) {
            this.stop();
            if (this._onBack) this._onBack();
            return;
        }

        if (this._available.length === 0 || this._pickIdx >= DRAFT_ORDER.length) {
            this._phase = 'done';
            // Small delay then fire callback
            setTimeout(() => {
                this.stop();
                if (this._onDone) this._onDone(this._p1Queue, this._p2Queue, this._p1Cfg, this._p2Cfg);
            }, 600);
            return;
        }

        // AI auto-pick
        if (this._isCurrentPickerAI()) {
            this._aiTimer++;
            if (this._aiTimer >= this._AI_DELAY) {
                // AI picks random available character
                const rndIdx = Math.floor(Math.random() * this._available.length);
                this._doPick(rndIdx);
                this._aiTimer = 0;
            }
            return;
        }

        // Human input
        this._aiTimer = 0;

        // Navigate grid (8 per row)
        const cols = 8;
        if (this._jp('ArrowLeft')  || this._jp('KeyA'))
            this._cursorIdx = Math.max(0, this._cursorIdx - 1);
        if (this._jp('ArrowRight') || this._jp('KeyD'))
            this._cursorIdx = Math.min(this._available.length - 1, this._cursorIdx + 1);
        if (this._jp('ArrowUp')    || this._jp('KeyW'))
            this._cursorIdx = Math.max(0, this._cursorIdx - cols);
        if (this._jp('ArrowDown')  || this._jp('KeyS'))
            this._cursorIdx = Math.min(this._available.length - 1, this._cursorIdx + cols);

        // Confirm pick
        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            this._doPick(this._cursorIdx);
        }
    }

    _doPick(poolIdx) {
        if (poolIdx < 0 || poolIdx >= this._available.length) return;
        const key = this._available.splice(poolIdx, 1)[0];
        const picker = this._currentPicker();
        if (picker === 0) this._p1Queue.push(key);
        else              this._p2Queue.push(key);
        this._pickIdx++;
        // Clamp cursor
        if (this._cursorIdx >= this._available.length)
            this._cursorIdx = Math.max(0, this._available.length - 1);
    }

    // ─── Render ─────────────────────────────────────────────────
    _render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, S.W, S.H);

        // Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        // Title
        ctx.font      = 'bold 40px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('DRAFT MODE', S.W / 2, 35);

        // Current picker info
        const picker = this._currentPicker();
        const pickNum = this._pickIdx + 1;
        if (this._phase === 'drafting' && picker >= 0) {
            const pColor = picker === 0 ? '#4488ff' : '#ff4444';
            const pName  = picker === 0 ? 'PLAYER 1' : 'PLAYER 2';
            const isAI   = this._isCurrentPickerAI();
            ctx.font      = 'bold 22px Arial';
            ctx.fillStyle = pColor;
            ctx.fillText(`${pName}${isAI ? ' (AI)' : ''} — Pick ${pickNum}/16`, S.W / 2, 68);
        } else {
            ctx.font      = 'bold 22px Arial';
            ctx.fillStyle = '#0f0';
            ctx.fillText('DRAFT COMPLETE!', S.W / 2, 68);
        }

        // ── Available characters grid ────────────────────────────
        const cols   = 8;
        const cellW  = 115;
        const cellH  = 115;
        const gridW  = cols * cellW;
        const startX = (S.W - gridW) / 2;
        const startY = 95;

        for (let i = 0; i < this._available.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx  = startX + col * cellW + cellW / 2;
            const cy  = startY + row * cellH + cellH / 2;
            const key = this._available[i];
            const rd  = SMASH.ROSTER[key];

            // Cell bg
            const sel = i === this._cursorIdx && !this._isCurrentPickerAI();
            ctx.fillStyle = sel ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.roundRect(cx - cellW / 2 + 4, cy - cellH / 2 + 4, cellW - 8, cellH - 8, 8);
            ctx.fill();

            if (sel) {
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Character color swatch
            ctx.fillStyle = rd.color || '#888';
            ctx.beginPath();
            ctx.arc(cx, cy - 12, 22, 0, Math.PI * 2);
            ctx.fill();

            // Name
            ctx.font      = '12px Arial';
            ctx.fillStyle = '#ccc';
            ctx.fillText(rd.name || key, cx, cy + 30);
        }

        // ── Drafted queues ───────────────────────────────────────
        this._renderQueue(ctx, 'P1', this._p1Queue, 20, 430, '#4488ff');
        this._renderQueue(ctx, 'P2', this._p2Queue, S.W / 2 + 20, 430, '#ff4444');

        // ── Controls hint ────────────────────────────────────────
        ctx.textAlign = 'center';
        ctx.font      = '14px Arial';
        ctx.fillStyle = '#555';
        ctx.fillText('Arrow Keys / WASD: Navigate   Enter/Space: Pick   Esc: Back', S.W / 2, S.H - 15);
    }

    _renderQueue(ctx, label, queue, x, y, color) {
        ctx.textAlign = 'left';
        ctx.font      = 'bold 20px Arial';
        ctx.fillStyle = color;
        ctx.fillText(`${label} Draft (${queue.length}/8)`, x, y);

        const cols = 8;
        const cellW = 72;
        const cellH = 60;

        for (let i = 0; i < queue.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx  = x + col * cellW + cellW / 2;
            const cy  = y + 25 + row * cellH + cellH / 2;
            const rd  = SMASH.ROSTER[queue[i]];

            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.roundRect(cx - cellW / 2 + 2, cy - cellH / 2 + 2, cellW - 4, cellH - 4, 6);
            ctx.fill();

            // Number
            ctx.font      = 'bold 14px Arial';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.fillText(`${i + 1}`, cx, cy - 12);

            // Name
            ctx.font      = '11px Arial';
            ctx.fillStyle = '#ccc';
            ctx.fillText(rd.name || queue[i], cx, cy + 10);
            ctx.textAlign = 'left';
        }
    }
}

SMASH.DraftScene = DraftScene;
})();
