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
     * @param {object} [modeInfo] — { gameMode, waveNumber, waveEnemiesLeft }
     */
    render(ctx, players, matchTime, modeInfo) {
        this._frame++;
        const n = players.length;
        if (n === 0) return;
        const mode = (modeInfo && modeInfo.gameMode) || 'stock';

        // Match timer (top-center)
        if (matchTime !== undefined) {
            this._renderTimer(ctx, matchTime);
        }

        // Wave defense header
        if (mode === 'wave' && modeInfo) {
            this._renderWaveHeader(ctx, modeInfo.waveNumber, modeInfo.waveEnemiesLeft);
        }

        // Draft mode header
        if (mode === 'draft' && modeInfo && modeInfo.draftRemaining) {
            this._renderDraftHeader(ctx, modeInfo.draftRemaining);
        }

        // Filter: in wave mode, only show human player panels
        const displayPlayers = mode === 'wave'
            ? players.filter(p => !p.isWaveEnemy)
            : players;

        // Player panels (bottom)
        const dn = displayPlayers.length;
        if (dn === 0) return;
        const panelW = Math.min(280, (S.W - 16 * (dn + 1)) / dn);
        const totalW = panelW * dn + 12 * (dn - 1);
        const startX = (S.W - totalW) / 2;
        const panelH = 102;
        const panelY = S.H - panelH - 8;

        for (let i = 0; i < dn; i++) {
            const x = startX + i * (panelW + 12);
            this._drawPanel(ctx, displayPlayers[i], x, panelY, panelW, panelH, mode);
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

    _renderWaveHeader(ctx, waveNum, enemiesLeft) {
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';

        // Wave number
        ctx.font      = 'bold 22px Arial';
        ctx.fillStyle = '#ff6644';
        ctx.shadowColor = '#000';
        ctx.shadowBlur  = 6;
        ctx.fillText(`WAVE ${waveNum}`, S.W / 2, 28);
        ctx.shadowBlur = 0;

        // Enemies remaining
        ctx.font      = '14px Arial';
        ctx.fillStyle = '#ccc';
        ctx.fillText(`Enemies remaining: ${enemiesLeft}`, S.W / 2, 54);

        ctx.restore();
    }

    _renderDraftHeader(ctx, remaining) {
        ctx.save();
        ctx.font      = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#000';
        ctx.shadowBlur  = 6;
        ctx.fillText('DRAFT MODE', S.W / 2, 22);
        ctx.shadowBlur = 0;
        ctx.font      = '14px Arial';
        ctx.fillStyle = '#4488ff';
        ctx.fillText(`P1: ${remaining[0]} left`, S.W / 2 - 80, 44);
        ctx.fillStyle = '#ff4444';
        ctx.fillText(`P2: ${remaining[1]} left`, S.W / 2 + 80, 44);
        ctx.restore();
    }

    _drawPanel(ctx, player, x, y, w, h, mode) {
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
        const teamColors = ['#ff4444', '#4488ff', '#44dd44', '#ddaa22'];
        const accentColor = (mode === 'team' && f.team >= 0)
            ? teamColors[f.team] || color
            : (f.isAlive ? color : '#555');
        ctx.fillStyle = accentColor;
        ctx.fillRect(x + 4, y, w - 8, 3);

        // Team label (if team mode)
        if (mode === 'team' && f.team >= 0) {
            const teamLabels = ['TEAM A', 'TEAM B', 'TEAM C', 'TEAM D'];
            ctx.font      = 'bold 10px Arial';
            ctx.fillStyle = teamColors[f.team] || '#fff';
            ctx.textAlign = 'right';
            ctx.fillText(teamLabels[f.team] || 'TEAM ?', x + w - 8, y + 14);
        }

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

        // ── Damage % / Stamina HP ─────────────────────────────────
        if (mode === 'stamina' && f.maxStaminaHP > 0) {
            // HP bar
            const hpW  = w - 24;
            const hpH  = 10;
            const hpX  = x + 12;
            const hpY  = y + 42;
            const ratio = Math.max(0, f.staminaHP / f.maxStaminaHP);

            // Track
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.roundRect(hpX, hpY, hpW, hpH, 4);
            ctx.fill();

            // Fill
            let hpColor;
            if      (ratio > 0.5) hpColor = '#44dd44';
            else if (ratio > 0.25) hpColor = '#ddaa22';
            else                   hpColor = '#dd3333';
            if (ratio > 0) {
                ctx.fillStyle = hpColor;
                ctx.beginPath();
                ctx.roundRect(hpX, hpY, hpW * ratio, hpH, 4);
                ctx.fill();
            }

            // Border
            ctx.strokeStyle = '#666';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.roundRect(hpX, hpY, hpW, hpH, 4);
            ctx.stroke();

            // HP text
            ctx.font      = 'bold 18px Arial';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.ceil(f.staminaHP)} HP`, x + w / 2, y + 68);
        } else {
            // Standard damage %
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
        }

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
