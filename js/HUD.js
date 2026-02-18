/**
 * HUD.js — In-game overlay: damage %, stocks, ultimate meter,
 *           shield HP, character name, match timer.
 */
(function () {
const S = SMASH.Settings;

class HUD {
    constructor() {
        this._frame = 0;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Array} players — [{port, fighter, controller, isAI}]
     * @param {number} [matchTime] — elapsed seconds
     */
    render(ctx, players, matchTime) {
        this._frame++;
        const n = players.length;
        if (n === 0) return;

        // Match timer (top-center)
        if (matchTime !== undefined) {
            this._renderTimer(ctx, matchTime);
        }

        // Player panels (bottom)
        const panelW = Math.min(280, (S.W - 16 * (n + 1)) / n);
        const totalW = panelW * n + 12 * (n - 1);
        const startX = (S.W - totalW) / 2;
        const panelH = 102;
        const panelY = S.H - panelH - 8;

        for (let i = 0; i < n; i++) {
            const x = startX + i * (panelW + 12);
            this._drawPanel(ctx, players[i], x, panelY, panelW, panelH);
        }
    }

    _renderTimer(ctx, t) {
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        ctx.save();
        ctx.font      = '16px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign  = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, S.W / 2, 6);
        ctx.restore();
    }

    _drawPanel(ctx, player, x, y, w, h) {
        const f     = player.fighter;
        const port  = player.port;
        const color = S.P_COLORS[port % 4];

        ctx.save();

        // ── Panel background ─────────────────────────────────────
        ctx.fillStyle = f.isAlive ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fill();

        // Color accent bar (top edge)
        ctx.fillStyle = f.isAlive ? color : '#555';
        ctx.fillRect(x + 4, y, w - 8, 3);

        // ── Player label + character name ─────────────────────────
        ctx.font      = 'bold 14px Arial';
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(`P${port + 1}`, x + 8, y + 20);

        ctx.font      = '11px Arial';
        ctx.fillStyle = player.isAI ? '#777' : '#999';
        ctx.fillText(player.isAI ? 'CPU' : '', x + 32, y + 20);

        ctx.font      = '12px Arial';
        ctx.fillStyle = '#bbb';
        ctx.textAlign = 'right';
        ctx.fillText(f.data.name || '', x + w - 8, y + 20);

        // ── Eliminated state ──────────────────────────────────────
        if (!f.isAlive) {
            ctx.font      = 'bold 28px Arial';
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.fillText('K.O.', x + w / 2, y + h / 2 + 10);
            ctx.restore();
            return;
        }

        // ── Damage % ─────────────────────────────────────────────
        const pct = f.damagePercent;
        let pctColor;
        if      (pct < 50)  pctColor = '#fff';
        else if (pct < 100) pctColor = '#ffdd44';
        else if (pct < 150) pctColor = '#ff8822';
        else                pctColor = '#ff3333';

        ctx.font      = 'bold 36px Arial';
        ctx.fillStyle = pctColor;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.floor(pct)}%`, x + w / 2, y + 58);

        // ── Stocks (dots) ─────────────────────────────────────────
        const stockY  = y + 78;
        const maxDots = Math.min(f.stocks, 10);
        const dotX    = x + 12;
        for (let s = 0; s < maxDots; s++) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(dotX + s * 14, stockY, 4.5, 0, Math.PI * 2);
            ctx.fill();
        }
        if (f.stocks > 10) {
            ctx.font      = '10px Arial';
            ctx.fillStyle = '#999';
            ctx.textAlign = 'left';
            ctx.fillText(`+${f.stocks - 10}`, dotX + 10 * 14, stockY + 3);
        }

        // ── Ultimate meter ────────────────────────────────────────
        const mw   = 100;
        const mh   = 8;
        const mx   = x + w - mw - 10;
        const my   = stockY - mh / 2;
        const full = f.ultimateMeter >= S.ULT_MAX;

        // Track background
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, 3);
        ctx.fill();

        // Fill
        const fillW = mw * Math.min(1, f.ultimateMeter / S.ULT_MAX);
        if (full) {
            const pulse = 0.7 + 0.3 * Math.sin(this._frame * 0.15);
            ctx.fillStyle   = `rgba(255,215,0,${pulse})`;
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur  = 8;
        } else {
            ctx.fillStyle = '#5588bb';
        }
        if (fillW > 0) {
            ctx.beginPath();
            ctx.roundRect(mx, my, fillW, mh, 3);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = full ? '#ffd700' : '#555';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, 3);
        ctx.stroke();

        // ULT READY label
        if (full) {
            ctx.font      = 'bold 10px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'left';
            ctx.fillText('ULT READY', mx, my - 3);
        }

        // ── Shield bar (slim, below stocks) ───────────────────────
        const shW = 50, shH = 3;
        const shX = x + 10, shY = stockY + 12;
        ctx.fillStyle = '#222';
        ctx.fillRect(shX, shY, shW, shH);

        const shFill = shW * (f.shieldHP / S.SHIELD_MAX_HP);
        ctx.fillStyle = f.shieldHP < 30 ? '#ff4444' : '#44aaff';
        ctx.fillRect(shX, shY, shFill, shH);

        ctx.restore();
    }
}

SMASH.HUD = HUD;
})();
