/**
 * TournamentScene.js — Full tournament mode.
 *
 * ══════════════════════════════════════════════════════════════════
 *  FLOW:
 *   1. Setup — randomize 16 chars into 4 groups of 4
 *   2. Player picks a character (or all-AI)
 *   3. Group stage — round-robin in each group
 *   4. Top 8 advance (sorted by wins, then random tiebreak)
 *   5. Bracket — single elimination (1v8, 4v5, 2v7, 3v6)
 *   6. Show results after each match, allow skip
 *   7. Final winner screen
 * ══════════════════════════════════════════════════════════════════
 */
(function () {
const S = SMASH.Settings;

function getSelectableKeys() {
    if (SMASH.Unlocks && typeof SMASH.Unlocks.getSelectableCharacterKeys === 'function') {
        return SMASH.Unlocks.getSelectableCharacterKeys();
    }
    return typeof SMASH.getCharacterKeys === 'function' ? SMASH.getCharacterKeys() : [];
}

// Bracket seed matchups: [seed1, seed2] index into top8 array
const BRACKET_MATCHUPS = [
    [0, 7],  // 1 vs 8
    [3, 4],  // 4 vs 5
    [1, 6],  // 2 vs 7
    [2, 5],  // 3 vs 6
];

class TournamentScene {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} options
     *   stageKey     — stage to play on
     *   onDone       — callback when tournament ends
     *   onBack       — callback to return to menu
     *   deviceMgr    — device manager for human player
     */
    constructor(canvas, options) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');

        this._stageKey  = (options && options.stageKey) || 'battlefield';
        this._ultimateVideos = !(options && options.ultimateVideos === false);
        this._onDone    = (options && options.onDone) || null;
        this._onBack    = (options && options.onBack) || null;
        this._deviceMgr = (options && options.deviceMgr) || null;

        // All 16 characters
        this._allKeys = getSelectableKeys();

        // ── Phase state ────────────────────────────────────────────
        // Phases: 'setup' | 'groupStage' | 'bracketReveal' | 'bracket' | 'finished'
        this._phase = 'setup';

        // ── Setup phase ────────────────────────────────────────────
        this._groups      = [[], [], [], []];    // 4 groups of 4 character keys
        this._playerChar  = null;               // character key the human controls (or null = all AI)
        this._setupCursor = 0;                  // cursor for character selection
        this._setupMode   = 'choosing';         // 'choosing' | 'allAI' | 'ready'

        // ── Group stage ────────────────────────────────────────────
        this._groupMatches    = [];              // all group stage matches [{a, b, groupIdx}]
        this._groupMatchIdx   = 0;
        this._groupResults    = {};              // { charKey: { wins, losses, group } }
        this._currentResult   = null;            // result of last match
        this._showingResult   = false;

        // ── Bracket ────────────────────────────────────────────────
        this._top8            = [];              // sorted by seed (0=best)
        this._bracketRounds   = [];              // [[match, match, ...], [...], ...]
        this._bracketRoundIdx = 0;
        this._bracketMatchIdx = 0;
        this._bracketResults  = [];              // parallel to bracketRounds
        this._champion        = null;

        // ── Active game reference ──────────────────────────────────
        this._activeGame = null;
        this._skipping   = false;

        // ── Tournament hint overlay ────────────────────────────────
        this._hintEl = document.getElementById('tournamentHint');

        // ── Input ──────────────────────────────────────────────────
        this._mk  = {};
        this._mkp = {};
        this._onKD = e => { this._mk[e.code] = true; };
        this._onKU = e => { this._mk[e.code] = false; };
        window.addEventListener('keydown', this._onKD);
        window.addEventListener('keyup',   this._onKU);

        this._running = false;
        this._raf     = null;

        // Randomize groups on creation
        this._randomizeGroups();
    }

    _jp(code) { return !!this._mk[code] && !this._mkp[code]; }

    // ═════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ═════════════════════════════════════════════════════════════

    start() {
        this._running = true;
        this._loop(performance.now());
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this._activeGame) { this._activeGame.stop(); this._activeGame = null; }
        if (this._hintEl) this._hintEl.style.display = 'none';
        window.removeEventListener('keydown', this._onKD);
        window.removeEventListener('keyup',   this._onKU);
    }

    _loop(now) {
        if (!this._running) return;
        // If an active game is running, check for skip input
        if (this._activeGame) {
            if (this._jp('Tab')) {
                this._skipCurrentMatch();
            }
            this._mkp = Object.assign({}, this._mk);
            this._raf = requestAnimationFrame(t => this._loop(t));
            return;
        }
        this._update();
        this._render();
        this._mkp = Object.assign({}, this._mk);
        this._raf = requestAnimationFrame(t => this._loop(t));
    }

    // ═════════════════════════════════════════════════════════════
    //  SETUP
    // ═════════════════════════════════════════════════════════════

    _randomizeGroups() {
        const shuffled = [...this._allKeys];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        for (let i = 0; i < 16; i++) {
            this._groups[Math.floor(i / 4)].push(shuffled[i]);
        }

        // Initialize results
        for (const key of this._allKeys) {
            const gIdx = this._groups.findIndex(g => g.includes(key));
            this._groupResults[key] = { wins: 0, losses: 0, group: gIdx };
        }

        // Build group match schedule (round-robin: each pair once)
        this._groupMatches = [];
        for (let g = 0; g < 4; g++) {
            const grp = this._groups[g];
            for (let a = 0; a < grp.length; a++) {
                for (let b = a + 1; b < grp.length; b++) {
                    this._groupMatches.push({ a: grp[a], b: grp[b], groupIdx: g });
                }
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  UPDATE DISPATCH
    // ═════════════════════════════════════════════════════════════

    _update() {
        switch (this._phase) {
            case 'setup':         return this._tickSetup();
            case 'groupStage':    return this._tickGroupStage();
            case 'bracketReveal': return this._tickBracketReveal();
            case 'bracket':       return this._tickBracket();
            case 'finished':      return this._tickFinished();
        }
    }

    // ── Setup: choose character or all-AI ────────────────────────
    _tickSetup() {
        if (this._jp('Escape')) {
            this.stop();
            if (this._onBack) this._onBack();
            return;
        }

        if (this._setupMode === 'choosing') {
            const keys = this._allKeys;
            const cols = 8;

            if (this._jp('ArrowLeft')  || this._jp('KeyA'))
                this._setupCursor = Math.max(0, this._setupCursor - 1);
            if (this._jp('ArrowRight') || this._jp('KeyD'))
                this._setupCursor = Math.min(keys.length, this._setupCursor + 1);
            if (this._jp('ArrowUp')    || this._jp('KeyW'))
                this._setupCursor = Math.max(0, this._setupCursor - cols);
            if (this._jp('ArrowDown')  || this._jp('KeyS'))
                this._setupCursor = Math.min(keys.length, this._setupCursor + cols);

            if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
                if (this._setupCursor < keys.length) {
                    // Pick this character
                    this._playerChar = keys[this._setupCursor];
                    this._setupMode = 'ready';
                } else {
                    // "All AI" option (cursor = keys.length)
                    this._playerChar = null;
                    this._setupMode = 'ready';
                }
            }
        } else if (this._setupMode === 'ready') {
            // Press Enter to start or Escape to go back
            if (this._jp('Escape') || this._jp('Backspace')) {
                this._setupMode = 'choosing';
                return;
            }
            if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
                this._phase         = 'groupStage';
                this._groupMatchIdx = 0;
                this._showingResult = false;
                this._launchGroupMatch();
            }
        }
    }

    // ── Group stage ──────────────────────────────────────────────
    _tickGroupStage() {
        if (this._showingResult) {
            // Escape → quit tournament
            if (this._jp('Escape')) {
                this.stop();
                if (this._onBack) this._onBack();
                return;
            }
            // Show result screen — press Enter to continue
            if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
                this._showingResult = false;
                this._groupMatchIdx++;
                if (this._groupMatchIdx >= this._groupMatches.length) {
                    // All group matches done → bracket
                    this._buildBracket();
                    this._phase = 'bracketReveal';
                } else {
                    this._launchGroupMatch();
                }
            }
            return;
        }
    }

    _launchGroupMatch() {
        const match = this._groupMatches[this._groupMatchIdx];
        if (!match) return;
        this._launchMatch(match.a, match.b, (winner) => {
            // Record result
            this._groupResults[winner].wins++;
            const loser = winner === match.a ? match.b : match.a;
            this._groupResults[loser].losses++;
            this._currentResult = {
                a: match.a,
                b: match.b,
                winner: winner,
                phase: 'group',
                groupIdx: match.groupIdx,
                matchNum: this._groupMatchIdx + 1,
                totalMatches: this._groupMatches.length,
            };
            this._showingResult = true;
        });
    }

    // ── Bracket reveal ───────────────────────────────────────────
    _tickBracketReveal() {
        if (this._jp('Escape')) {
            this.stop();
            if (this._onBack) this._onBack();
            return;
        }
        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            this._phase = 'bracket';
            this._bracketRoundIdx = 0;
            this._bracketMatchIdx = 0;
            this._showingResult = false;
            this._launchBracketMatch();
        }
    }

    // ── Bracket ──────────────────────────────────────────────────
    _tickBracket() {
        if (this._showingResult) {
            // Escape → quit tournament
            if (this._jp('Escape')) {
                this.stop();
                if (this._onBack) this._onBack();
                return;
            }
            if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
                this._showingResult = false;
                this._bracketMatchIdx++;
                const round = this._bracketRounds[this._bracketRoundIdx];
                if (this._bracketMatchIdx >= round.length) {
                    // All matches in this round done
                    // Check if a champion has been crowned (final was a 1-match round)
                    if (round.length === 1 && round[0].winner) {
                        this._champion = round[0].winner;
                        this._phase = 'finished';
                        return;
                    }
                    // Build next round from winners
                    this._buildNextBracketRound();
                    this._bracketRoundIdx++;
                    this._bracketMatchIdx = 0;
                }
                this._launchBracketMatch();
            }
            return;
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  MATCH LAUNCHING
    // ═════════════════════════════════════════════════════════════

    _launchMatch(charKeyA, charKeyB, onResult) {
        // Safety: stop any lingering previous game
        if (this._activeGame) {
            this._activeGame.stop();
            this._activeGame = null;
        }

        // Determine if human controls one of these characters
        const isHumanA = this._playerChar === charKeyA;
        const isHumanB = this._playerChar === charKeyB;

        const configs = [
            {
                port: 0,
                character: charKeyA,
                type: isHumanA ? 'keyboard' : 'ai',
                level: 5,
                team: -1,
                ...(isHumanA ? { deviceConfig: { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: 'wasd' } } : {}),
            },
            {
                port: 1,
                character: charKeyB,
                type: isHumanB ? 'keyboard' : 'ai',
                level: 5,
                team: -1,
                ...(isHumanB ? { deviceConfig: { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: 'wasd' } } : {}),
            },
        ];

        // Show skip hint overlay
        if (this._hintEl) this._hintEl.style.display = 'block';

        const self = this;
        const game = new SMASH.Game(this.canvas, configs, {
            stageKey: this._stageKey,
            stocks: 3,
            debug: false,
            gameMode: 'stock',
            ultimateVideos: this._ultimateVideos,
            onExit: function (reason) {
                // Hide skip hint
                if (self._hintEl) self._hintEl.style.display = 'none';
                self._activeGame = null;

                // "Quit to Menu" / "Character Select" from pause menu → exit tournament
                if (reason === 'menu' || reason === 'charSelect') {
                    self.stop();
                    if (self._onBack) self._onBack();
                    return;
                }

                // Normal match end — record result
                const p0Alive = game.fighters[0] && game.fighters[0].isAlive;
                const winner  = p0Alive ? charKeyA : charKeyB;
                if (onResult) onResult(winner);
            },
        });

        // Override game over to auto-exit after a brief pause.
        // Do NOT show the normal Rematch/CharSelect/MainMenu overlay;
        // the tournament result screen handles "what comes next".
        game._tickGameOver = () => {
            if (!game._autoExitTimer) game._autoExitTimer = 0;
            game._autoExitTimer++;

            // 1-second delay so the player can see who won
            const delay = self._skipping ? 1 : 60;
            if (game._autoExitTimer > delay) {
                game.stop();
                if (game.onExit) game.onExit('tournamentContinue');
            }
        };

        game.start();
        game._suppressGameOverMenu = true;
        this._activeGame = game;
        this._skipping   = false;
    }

    _skipCurrentMatch() {
        // Instantly resolve the current match (random winner with AI bias)
        if (this._activeGame) {
            this._skipping = true;
            // Force game to end — kill all fighters of one side
            const fighters = this._activeGame.fighters;
            if (fighters.length >= 2) {
                // Random winner
                const loserIdx = Math.random() < 0.5 ? 0 : 1;
                fighters[loserIdx].stocks = 0;
                fighters[loserIdx].state = 'dead';
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  BRACKET BUILDING
    // ═════════════════════════════════════════════════════════════

    _buildBracket() {
        // Sort all 16 chars by wins (desc), then random tiebreak
        const sorted = [...this._allKeys].sort((a, b) => {
            const diff = this._groupResults[b].wins - this._groupResults[a].wins;
            if (diff !== 0) return diff;
            return Math.random() - 0.5;
        });

        this._top8 = sorted.slice(0, 8);

        // Quarter-finals: seeded matchups
        const qf = BRACKET_MATCHUPS.map(([s1, s2]) => ({
            a: this._top8[s1],
            b: this._top8[s2],
            winner: null,
        }));

        this._bracketRounds  = [qf];
        this._bracketResults = [[]];
    }

    _buildNextBracketRound() {
        const prevRound = this._bracketRounds[this._bracketRoundIdx];
        if (!prevRound) return;

        const winners = prevRound.map(m => m.winner);
        const nextRound = [];
        for (let i = 0; i < winners.length; i += 2) {
            if (i + 1 < winners.length) {
                nextRound.push({ a: winners[i], b: winners[i + 1], winner: null });
            } else {
                // Bye
                nextRound.push({ a: winners[i], b: null, winner: winners[i] });
            }
        }

        this._bracketRounds.push(nextRound);
        this._bracketResults.push([]);
    }

    _launchBracketMatch() {
        const round = this._bracketRounds[this._bracketRoundIdx];
        if (!round) return;
        const match = round[this._bracketMatchIdx];
        if (!match) return;

        // Bye match
        if (!match.b) {
            match.winner = match.a;
            this._currentResult = {
                a: match.a, b: null, winner: match.a,
                phase: 'bracket',
                roundName: this._bracketRoundName(),
            };
            this._showingResult = true;
            return;
        }

        this._launchMatch(match.a, match.b, (winner) => {
            match.winner = winner;
            this._currentResult = {
                a: match.a,
                b: match.b,
                winner: winner,
                phase: 'bracket',
                roundName: this._bracketRoundName(),
            };
            this._showingResult = true;

            // Check for champion
            if (this._bracketRoundIdx === this._bracketRounds.length - 1 &&
                this._bracketMatchIdx === round.length - 1) {
                // If this was a final with only 1 match that resolved, need to check
                // if we need more rounds
                const allDecided = round.every(m => m.winner);
                if (allDecided && round.length === 1) {
                    this._champion = winner;
                }
            }
        });
    }

    _bracketRoundName() {
        const round = this._bracketRounds[this._bracketRoundIdx];
        if (!round) return '';
        if (round.length === 4) return 'Quarter-Finals';
        if (round.length === 2) return 'Semi-Finals';
        if (round.length === 1) return 'GRAND FINAL';
        return `Round ${this._bracketRoundIdx + 1}`;
    }

    // ── Finished ─────────────────────────────────────────────────
    _tickFinished() {
        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space') || this._jp('Escape')) {
            this.stop();
            if (this._onDone) this._onDone(this._champion);
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER DISPATCH
    // ═════════════════════════════════════════════════════════════

    _render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, S.W, S.H);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, S.W, S.H);

        switch (this._phase) {
            case 'setup':         return this._renderSetup(ctx);
            case 'groupStage':    return this._renderGroupStage(ctx);
            case 'bracketReveal': return this._renderBracketReveal(ctx);
            case 'bracket':       return this._renderBracket(ctx);
            case 'finished':      return this._renderFinished(ctx);
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER — SETUP
    // ═════════════════════════════════════════════════════════════

    _renderSetup(ctx) {
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        ctx.font      = 'bold 40px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('TOURNAMENT MODE', S.W / 2, 35);

        // Groups display
        this._renderGroupsOverview(ctx, 70);

        if (this._setupMode === 'choosing') {
            ctx.font      = 'bold 20px Arial';
            ctx.fillStyle = '#fff';
            ctx.fillText('Choose your character (or select "All AI")', S.W / 2, 310);

            // Character grid + All AI option
            const keys = this._allKeys;
            const cols = 8;
            const cellW = 115, cellH = 80;
            const gridW = cols * cellW;
            const startX = (S.W - gridW) / 2;
            const startY = 335;

            for (let i = 0; i <= keys.length; i++) {
                const isAllAI = i === keys.length;
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx  = startX + col * cellW + cellW / 2;
                const cy  = startY + row * cellH + cellH / 2;

                const sel = i === this._setupCursor;
                ctx.fillStyle = sel ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.06)';
                ctx.beginPath();
                ctx.roundRect(cx - cellW / 2 + 4, cy - cellH / 2 + 4, cellW - 8, cellH - 8, 8);
                ctx.fill();
                if (sel) {
                    ctx.strokeStyle = '#ffd700';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                if (isAllAI) {
                    ctx.font      = 'bold 14px Arial';
                    ctx.fillStyle = '#ff8844';
                    ctx.fillText('ALL AI', cx, cy);
                } else {
                    const rd = SMASH.ROSTER[keys[i]];
                    ctx.fillStyle = rd.color || '#888';
                    ctx.beginPath();
                    ctx.arc(cx, cy - 8, 16, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.font      = '11px Arial';
                    ctx.fillStyle = '#ccc';
                    ctx.fillText(rd.name || keys[i], cx, cy + 22);
                }
            }

            ctx.font      = '14px Arial';
            ctx.fillStyle = '#555';
            ctx.fillText('Arrows/WASD: Navigate   Enter: Select   Esc: Back', S.W / 2, S.H - 15);

        } else if (this._setupMode === 'ready') {
            ctx.font      = 'bold 24px Arial';
            ctx.fillStyle = '#0f0';
            const charName = this._playerChar
                ? SMASH.ROSTER[this._playerChar].name
                : 'All AI';
            ctx.fillText(`Selected: ${charName}`, S.W / 2, 340);

            ctx.font      = '18px Arial';
            ctx.fillStyle = '#aaa';
            ctx.fillText('Press Enter to start tournament, Esc to go back', S.W / 2, 380);
        }
    }

    _renderGroupsOverview(ctx, startY) {
        const groupW = 280;
        const gap    = 16;
        const totalW = 4 * groupW + 3 * gap;
        const baseX  = (S.W - totalW) / 2;

        for (let g = 0; g < 4; g++) {
            const gx = baseX + g * (groupW + gap);
            const gy = startY;

            // Group header
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.roundRect(gx, gy, groupW, 200, 8);
            ctx.fill();

            ctx.font      = 'bold 16px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'center';
            ctx.fillText(`Group ${String.fromCharCode(65 + g)}`, gx + groupW / 2, gy + 18);

            // Characters in group
            for (let c = 0; c < this._groups[g].length; c++) {
                const key = this._groups[g][c];
                const rd  = SMASH.ROSTER[key];
                const res = this._groupResults[key];
                const cy  = gy + 40 + c * 40;

                ctx.textAlign = 'left';
                ctx.font      = '14px Arial';
                ctx.fillStyle = rd.color || '#ccc';
                ctx.fillText(rd.name, gx + 12, cy + 10);

                if (res && (res.wins > 0 || res.losses > 0)) {
                    ctx.textAlign = 'right';
                    ctx.font      = '13px Arial';
                    ctx.fillStyle = '#aaa';
                    ctx.fillText(`${res.wins}W - ${res.losses}L`, gx + groupW - 12, cy + 10);
                }

                // Highlight player's character
                if (key === this._playerChar) {
                    ctx.fillStyle = 'rgba(255,215,0,0.15)';
                    ctx.fillRect(gx + 2, cy - 5, groupW - 4, 30);
                    ctx.font      = 'bold 9px Arial';
                    ctx.fillStyle = '#ffd700';
                    ctx.textAlign = 'right';
                    ctx.fillText('YOU', gx + groupW - 12, cy - 2);
                }
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER — GROUP STAGE
    // ═════════════════════════════════════════════════════════════

    _renderGroupStage(ctx) {
        if (!this._showingResult) return; // game is active, don't render

        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        ctx.font      = 'bold 32px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('GROUP STAGE RESULT', S.W / 2, 40);

        const r = this._currentResult;
        if (r) {
            const rdA = SMASH.ROSTER[r.a];
            const rdB = SMASH.ROSTER[r.b];
            const rdW = SMASH.ROSTER[r.winner];

            ctx.font      = '16px Arial';
            ctx.fillStyle = '#888';
            ctx.fillText(`Match ${r.matchNum} / ${r.totalMatches}  —  Group ${String.fromCharCode(65 + r.groupIdx)}`, S.W / 2, 75);

            // VS display
            ctx.font      = 'bold 36px Arial';
            ctx.fillStyle = rdA.color || '#fff';
            ctx.textAlign = 'right';
            ctx.fillText(rdA.name, S.W / 2 - 30, 160);

            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.fillText('VS', S.W / 2, 160);

            ctx.fillStyle = rdB.color || '#fff';
            ctx.textAlign = 'left';
            ctx.fillText(rdB.name, S.W / 2 + 30, 160);

            // Winner
            ctx.font      = 'bold 28px Arial';
            ctx.fillStyle = '#0f0';
            ctx.textAlign = 'center';
            ctx.fillText(`${rdW.name} WINS!`, S.W / 2, 220);
        }

        // Group standings
        this._renderGroupsOverview(ctx, 280);

        // Skip button hint
        ctx.font      = '14px Arial';
        ctx.fillStyle = '#555';
        ctx.fillText('Enter: Next Match   Tab: Skip All Group Matches   Esc: Quit Tournament', S.W / 2, S.H - 15);

        // Allow tab to skip remaining group matches
        if (this._jp('Tab')) {
            this._skipRemainingGroupMatches();
        }
    }

    _skipRemainingGroupMatches() {
        // Simulate all remaining group matches
        while (this._groupMatchIdx < this._groupMatches.length - 1) {
            this._groupMatchIdx++;
            const match = this._groupMatches[this._groupMatchIdx];
            // Random winner
            const winner = Math.random() < 0.5 ? match.a : match.b;
            const loser  = winner === match.a ? match.b : match.a;
            this._groupResults[winner].wins++;
            this._groupResults[loser].losses++;
        }
        // Move to bracket
        this._groupMatchIdx = this._groupMatches.length;
        this._showingResult = false;
        this._buildBracket();
        this._phase = 'bracketReveal';
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER — BRACKET REVEAL
    // ═════════════════════════════════════════════════════════════

    _renderBracketReveal(ctx) {
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        ctx.font      = 'bold 36px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('TOP 8 — BRACKET', S.W / 2, 40);

        // Show seedings
        ctx.font = '14px Arial';
        ctx.fillStyle = '#888';
        ctx.fillText('Seeded by group stage wins', S.W / 2, 68);

        // Seeds list
        for (let i = 0; i < this._top8.length; i++) {
            const key = this._top8[i];
            const rd  = SMASH.ROSTER[key];
            const res = this._groupResults[key];
            const yPos = 100 + i * 36;

            ctx.textAlign = 'center';
            ctx.font      = 'bold 16px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(`#${i + 1}`, S.W / 2 - 180, yPos);

            ctx.fillStyle = rd.color || '#ccc';
            ctx.textAlign = 'left';
            ctx.fillText(rd.name, S.W / 2 - 140, yPos);

            ctx.font      = '14px Arial';
            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'right';
            ctx.fillText(`${res.wins}W - ${res.losses}L`, S.W / 2 + 200, yPos);

            if (key === this._playerChar) {
                ctx.font      = 'bold 10px Arial';
                ctx.fillStyle = '#ffd700';
                ctx.textAlign = 'left';
                ctx.fillText('★ YOU', S.W / 2 + 210, yPos);
            }
        }

        // Bracket preview
        this._renderBracketDiagram(ctx, 420);

        ctx.font      = '14px Arial';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.fillText('Enter: Begin Bracket   Esc: Quit Tournament', S.W / 2, S.H - 15);
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER — BRACKET MATCHES
    // ═════════════════════════════════════════════════════════════

    _renderBracket(ctx) {
        if (!this._showingResult) return;

        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        const r = this._currentResult;
        const roundName = r ? r.roundName : '';

        ctx.font      = 'bold 32px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(roundName, S.W / 2, 40);

        if (r) {
            if (!r.b) {
                // Bye
                const rdA = SMASH.ROSTER[r.a];
                ctx.font      = 'bold 24px Arial';
                ctx.fillStyle = '#aaa';
                ctx.fillText(`${rdA.name} advances (bye)`, S.W / 2, 120);
            } else {
                const rdA = SMASH.ROSTER[r.a];
                const rdB = SMASH.ROSTER[r.b];
                const rdW = SMASH.ROSTER[r.winner];

                ctx.font      = 'bold 36px Arial';
                ctx.fillStyle = rdA.color || '#fff';
                ctx.textAlign = 'right';
                ctx.fillText(rdA.name, S.W / 2 - 30, 130);

                ctx.fillStyle = '#666';
                ctx.textAlign = 'center';
                ctx.fillText('VS', S.W / 2, 130);

                ctx.fillStyle = rdB.color || '#fff';
                ctx.textAlign = 'left';
                ctx.fillText(rdB.name, S.W / 2 + 30, 130);

                ctx.font      = 'bold 28px Arial';
                ctx.fillStyle = '#0f0';
                ctx.textAlign = 'center';
                ctx.fillText(`${rdW.name} WINS!`, S.W / 2, 200);
            }
        }

        // Show full bracket diagram
        this._renderBracketDiagram(ctx, 270);

        ctx.font      = '14px Arial';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.fillText('Enter: Next Match   Esc: Quit Tournament', S.W / 2, S.H - 15);
    }

    _renderBracketDiagram(ctx, startY) {
        // Render the bracket visually
        const rounds = this._bracketRounds;
        if (rounds.length === 0) {
            // Just show QF based on seedings
            const qf = BRACKET_MATCHUPS;
            const matchH = 70;
            const matchW = 200;
            const gap = 15;
            const baseX = (S.W - matchW) / 2;

            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd700';
            ctx.fillText('Quarter-Finals', S.W / 2, startY);

            for (let i = 0; i < qf.length; i++) {
                const [s1, s2] = qf[i];
                const my = startY + 20 + i * (matchH + gap);
                const rdA = SMASH.ROSTER[this._top8[s1]];
                const rdB = SMASH.ROSTER[this._top8[s2]];

                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath();
                ctx.roundRect(baseX, my, matchW, matchH, 6);
                ctx.fill();

                ctx.font      = '14px Arial';
                ctx.textAlign = 'left';
                ctx.fillStyle = rdA.color || '#ccc';
                ctx.fillText(`#${s1 + 1} ${rdA.name}`, baseX + 10, my + 22);
                ctx.fillStyle = rdB.color || '#ccc';
                ctx.fillText(`#${s2 + 1} ${rdB.name}`, baseX + 10, my + 50);
            }
            return;
        }

        // Dynamic bracket rendering
        const totalRounds = rounds.length;
        const roundW = 220;
        const gapX   = 30;
        const totalW = totalRounds * roundW + (totalRounds - 1) * gapX;
        let baseX    = (S.W - totalW) / 2;

        const roundNames = ['Quarter-Finals', 'Semi-Finals', 'Grand Final'];

        for (let r = 0; r < totalRounds; r++) {
            const rx = baseX + r * (roundW + gapX);
            const round = rounds[r];
            const matchH = 60;
            const totalMatchH = round.length * matchH + (round.length - 1) * 10;
            let   my = startY + 20;

            // Round label
            ctx.font      = 'bold 13px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'center';
            ctx.fillText(roundNames[r] || `Round ${r + 1}`, rx + roundW / 2, startY);

            for (let m = 0; m < round.length; m++) {
                const match = round[m];
                const rdA = match.a ? SMASH.ROSTER[match.a] : null;
                const rdB = match.b ? SMASH.ROSTER[match.b] : null;

                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath();
                ctx.roundRect(rx, my, roundW, matchH, 6);
                ctx.fill();

                ctx.font      = '13px Arial';
                ctx.textAlign = 'left';

                // Fighter A
                if (rdA) {
                    const isWinner = match.winner === match.a;
                    ctx.fillStyle = isWinner ? '#0f0' : (match.winner ? '#555' : (rdA.color || '#ccc'));
                    ctx.font      = isWinner ? 'bold 13px Arial' : '13px Arial';
                    ctx.fillText(rdA.name, rx + 10, my + 18);
                } else {
                    ctx.fillStyle = '#444';
                    ctx.fillText('TBD', rx + 10, my + 18);
                }

                // Fighter B
                if (rdB) {
                    const isWinner = match.winner === match.b;
                    ctx.fillStyle = isWinner ? '#0f0' : (match.winner ? '#555' : (rdB.color || '#ccc'));
                    ctx.font      = isWinner ? 'bold 13px Arial' : '13px Arial';
                    ctx.fillText(rdB.name, rx + 10, my + 42);
                } else {
                    ctx.fillStyle = '#444';
                    ctx.fillText(match.b === null && match.a ? 'BYE' : 'TBD', rx + 10, my + 42);
                }

                // Divider
                ctx.strokeStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(rx + 8, my + 30);
                ctx.lineTo(rx + roundW - 8, my + 30);
                ctx.stroke();

                my += matchH + 10;
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER — FINISHED
    // ═════════════════════════════════════════════════════════════

    _renderFinished(ctx) {
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        ctx.font      = 'bold 48px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur  = 20;
        ctx.fillText('TOURNAMENT CHAMPION', S.W / 2, 80);
        ctx.shadowBlur = 0;

        if (this._champion) {
            const rd = SMASH.ROSTER[this._champion];
            ctx.font      = 'bold 64px Arial';
            ctx.fillStyle = rd.color || '#fff';
            ctx.fillText(rd.name, S.W / 2, 180);

            if (this._champion === this._playerChar) {
                ctx.font      = 'bold 28px Arial';
                ctx.fillStyle = '#0f0';
                ctx.fillText('★ YOU WIN! ★', S.W / 2, 240);
            }
        }

        // Show bracket diagram
        this._renderBracketDiagram(ctx, 300);

        ctx.font      = '16px Arial';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText('Press Enter to return to menu', S.W / 2, S.H - 20);
    }
}

SMASH.TournamentScene = TournamentScene;
})();
