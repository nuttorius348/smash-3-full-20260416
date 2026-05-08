/**
 * DungeonScene.js - Single-player dungeon gauntlet mode.
 */
(function () {
const S = SMASH.Settings;

const DUNGEON_SAVE_KEY = 'smash3_dungeon_save_v1';
const DUNGEON_STAGE_ROTATION = [
    'battlefield',
    'final_destination',
    'wide_arena',
    'sky_fortress',
    'crystal_caverns',
    'orbital_station',
];

const DUNGEON_BOSS_NAMES = [
    'Slaveish',
    'Frankie',
    'Nutsack',
    'Metabot',
    'Netanyahu',
    'Bomber',
    'Aru',
    'Kirky',
    'Epstein',
    'Fazbear',
    'Droid',
    'Diddy',
    'Trump',
    'Kiddo',
    'Speed',
    'Vaughan',
    'Sahur',
    'Alfgar Yolanda',
    'Omni Man',
];

const ULTRA_TRANSFORM_VIDEO = 'assets/UltraLazer transformation.mp4';
const CELL_PHASE3_END_VIDEO = 'assets/Phase 3 End.mp4';

const LEVEL_CAP = 10;
const LEVEL_XP = [
    0,    // Lv1
    120,  // Lv2
    260,  // Lv3
    430,  // Lv4
    620,  // Lv5
    840,  // Lv6
    1100, // Lv7
    1400, // Lv8
    1750, // Lv9
    2150, // Lv10
];

const XP_REWARDS = {
    boss: 140,
    gauntletWave: 120,
    cell: 360,
};

const DUNGEON_PLAYER_STOCKS = 3;
const DUNGEON_BOSS_STOCKS = 1;
const CELL_STOCKS = 4;

const GAUNTLET_WAVE_SIZE = 3;

const LEVEL_PERKS = {
    2: ['Quick Trigger (faster neutral special)'],
    3: ['Overclocked Shots (stronger projectile)'],
    4: ['Reinforced Core (heavier, less knockback)'],
    5: ['Piercing Beam (laser neutral special)'],
    6: ['Power Elbow (stronger side special)'],
    7: ['Extra Jump'],
    8: ['Armor Focus (stronger down special armor)'],
    9: ['Final Burst (stronger ultimate)'],
    10: ['Ultra Lazer unlocked'],
};

function normalizeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tokenize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function resolveBossKeys(names) {
    const roster = SMASH.ROSTER || {};
    const keys = Object.keys(roster);
    const byName = new Map();

    for (const key of keys) {
        const name = roster[key] && roster[key].name ? roster[key].name : key;
        byName.set(normalizeKey(name), key);
        byName.set(normalizeKey(key), key);
    }

    return names.map(name => {
        const direct = byName.get(normalizeKey(name));
        if (direct) return direct;

        const tokens = tokenize(name);
        let bestKey = null;
        let bestScore = 0;
        for (const key of keys) {
            const entry = roster[key] || {};
            const candidate = tokenize(entry.name || key);
            if (tokens.length > 0 && tokens.every(t => candidate.includes(t))) {
                return key;
            }
            if (tokens.length > 0) {
                const score = tokens.filter(t => candidate.includes(t)).length;
                if (score > bestScore) {
                    bestScore = score;
                    bestKey = key;
                }
            }
        }

        if (bestKey) return bestKey;

        console.warn('Dungeon boss name not found in roster:', name);
        return 'brawler';
    });
}

function chunk(array, size) {
    const out = [];
    for (let i = 0; i < array.length; i += size) {
        out.push(array.slice(i, i + size));
    }
    return out;
}

function getLevelForXp(xp) {
    let level = 1;
    for (let i = 0; i < LEVEL_XP.length; i++) {
        if (xp >= LEVEL_XP[i]) level = i + 1;
    }
    return Math.min(LEVEL_CAP, level);
}

function getXpForNextLevel(level) {
    if (level >= LEVEL_CAP) return LEVEL_XP[LEVEL_CAP - 1];
    return LEVEL_XP[level];
}

function defaultProgress() {
    return {
        phase: 'boss',
        bossIndex: 0,
        gauntletWave: 0,
        stageIndex: 0,
        xp: 0,
        level: 1,
        ultraUnlocked: false,
        ultraTransformPlayed: false,
        cellUnlocked: false,
        cellPhase: 1,
        updatedAt: Date.now(),
    };
}

function loadProgress() {
    try {
        const raw = localStorage.getItem(DUNGEON_SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return Object.assign(defaultProgress(), data || {});
    } catch (err) {
        console.warn('Failed to load dungeon progress:', err);
        return null;
    }
}

function saveProgress(progress) {
    try {
        const data = Object.assign({}, progress, { updatedAt: Date.now() });
        localStorage.setItem(DUNGEON_SAVE_KEY, JSON.stringify(data));
    } catch (err) {
        console.warn('Failed to save dungeon progress:', err);
    }
}

function clearProgress() {
    try {
        localStorage.removeItem(DUNGEON_SAVE_KEY);
    } catch (err) {
        console.warn('Failed to clear dungeon progress:', err);
    }
}

function hasSave() {
    try {
        return !!localStorage.getItem(DUNGEON_SAVE_KEY);
    } catch (err) {
        return false;
    }
}

function pickPlayerDevice(deviceMgr) {
    if (!deviceMgr || typeof deviceMgr.scan !== 'function') {
        return { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: 'wasd' };
    }
    deviceMgr.scan();
    const devices = deviceMgr.getDevices ? deviceMgr.getDevices() : [];
    const gamepad = devices.find(d => d.type && d.type !== SMASH.CONTROLLER_TYPES.KEYBOARD);
    if (gamepad) {
        return { type: gamepad.type, index: gamepad.index };
    }
    const keyboard = devices.find(d => d.type === SMASH.CONTROLLER_TYPES.KEYBOARD && d.layout === 'wasd');
    return { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: (keyboard && keyboard.layout) || 'wasd' };
}

function buildDungeonLazerData(level) {
    if (level >= LEVEL_CAP) {
        return new SMASH.FighterData('ultra_lazer');
    }

    const data = new SMASH.FighterData('brawler');

    const speedMult = 1 + (level - 1) * 0.03;
    const jumpMult = 1 + (level - 1) * 0.02;

    data.walkSpeed *= speedMult;
    data.runSpeed *= speedMult;
    data.airSpeed *= speedMult;
    data.jumpForce *= jumpMult;
    data.shortHopForce *= jumpMult;
    data.doubleJumpForce *= jumpMult;

    if (level >= 4) {
        data.weight += 10;
    }

    const neutral = data.attacks && data.attacks.neutral_special;
    if (neutral) {
        if (level >= 2) {
            neutral.startupFrames = Math.max(4, neutral.startupFrames - 2);
            neutral.endlagFrames = Math.max(6, neutral.endlagFrames - 2);
        }
        if (level >= 3) {
            neutral.damage += 2;
            neutral.projDamage = (neutral.projDamage || neutral.damage) + 2;
            neutral.projSpeed = (neutral.projSpeed || 600) + 200;
        }
        if (level >= 5) {
            neutral.projectileType = 'laser';
            neutral.projPiercing = true;
            neutral.projMaxHits = 3;
            neutral.projTrail = 12;
            neutral.projLifetime = Math.max(neutral.projLifetime || 40, 55);
            neutral.projSpeed = Math.max(neutral.projSpeed || 900, 1100);
        }
    }

    const side = data.attacks && data.attacks.side_special;
    if (side && level >= 6) {
        side.damage += 4;
        side.baseKB += 80;
    }

    const down = data.attacks && data.attacks.down_special;
    if (down && level >= 8) {
        down.isArmored = true;
        down.armorHits = Math.max(down.armorHits || 1, 2);
        down.armorDuringStartup = true;
    }

    if (level >= 7) {
        data.maxJumps += 1;
    }

    if (level >= 9 && data.ultimateAttack) {
        data.ultimateAttack.damage *= 1.25;
        data.ultimateAttack.baseKB *= 1.2;
    }

    return data;
}

function applyLazerPerks(fighter, level) {
    if (!fighter) return;
    const data = buildDungeonLazerData(level);
    fighter.data = data;
    fighter.width = data.width;
    fighter.height = data.height;
    fighter.jumpsRemaining = data.maxJumps;
    fighter.damageMultiplier = 1 + (level - 1) * 0.05;
}

function buildCellData(key) {
    return new SMASH.FighterData(key);
}

class DungeonScene {
    constructor(canvas, options) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this._deviceMgr = (options && options.deviceMgr) || null;
        this._onBack = (options && options.onBack) || null;
        this._ultimateVideos = !(options && options.ultimateVideos === false);
        this._soundsEnabled = !(options && options.soundsEnabled === false);
        this._resume = !!(options && options.resume);

        this._bossNames = [...DUNGEON_BOSS_NAMES];
        this._bossKeys = resolveBossKeys(this._bossNames);
        this._gauntletWaves = chunk(this._bossKeys, GAUNTLET_WAVE_SIZE);
        this._stages = [...DUNGEON_STAGE_ROTATION];

        const loaded = this._resume ? loadProgress() : null;
        this._progress = loaded || defaultProgress();
        if (!this._resume) clearProgress();
        this._progress.level = getLevelForXp(this._progress.xp || 0);
        if (this._progress.level >= LEVEL_CAP && !this._progress.ultraUnlocked) {
            this._progress.ultraUnlocked = true;
            if (SMASH.Unlocks && SMASH.Unlocks.unlockCharacter) {
                SMASH.Unlocks.unlockCharacter('ultra_lazer');
            }
        }

        this._pendingUltraTransform = false;
        this._transformVideoEl = this._createTransformVideoElement();
        this._transformPlaying = false;

        this._game = null;
        this._running = false;
        this._raf = null;
        this._lastTime = 0;
        this._gameOverTimer = 0;
        this._levelUpTimer = 0;
        this._levelUpLines = [];
        this._cellUltBaseline = 0;
    }

    start() {
        this._running = true;
        this._lastTime = performance.now();
        this._saveProgress();
        this._startNextEncounter();
        this._loop(this._lastTime);
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        if (this._game) {
            this._game.stop();
            this._game = null;
        }
        if (this._transformVideoEl) {
            this._transformVideoEl.pause();
            this._transformVideoEl.style.display = 'none';
        }
    }

    _loop(now) {
        if (!this._running) return;
        const dt = Math.max(0, (now - this._lastTime) / 1000);
        this._lastTime = now;
        this._tick(dt);
        this._raf = requestAnimationFrame(t => this._loop(t));
    }

    _tick(dt) {
        if (this._game && this._game.state === 'gameover') {
            this._gameOverTimer += dt;
            if (this._gameOverTimer > 2.2) {
                this._handleMatchEnd();
            }
        } else {
            this._gameOverTimer = 0;
        }

        if (this._game && this._progress.phase === 'cell') {
            this._tickCellPhase();
        }

        if (this._levelUpTimer > 0) {
            this._levelUpTimer = Math.max(0, this._levelUpTimer - dt);
        }
    }

    _startNextEncounter() {
        const phase = this._progress.phase;
        if (phase === 'boss') {
            const bossKey = this._bossKeys[this._progress.bossIndex];
            this._launchMatch([bossKey], { label: 'Boss', isCell: false });
            return;
        }

        if (phase === 'gauntlet') {
            const wave = this._gauntletWaves[this._progress.gauntletWave] || [];
            this._launchMatch(wave, { label: 'Gauntlet', isCell: false });
            return;
        }

        if (phase === 'cell') {
            if (!this._progress.cellPhase) this._progress.cellPhase = 1;
            const cellKey = this._getCellPhaseKey(this._progress.cellPhase);
            this._launchMatch([cellKey], { label: 'Cell', isCell: true, cellPhase: this._progress.cellPhase });
            return;
        }

        this._finishDungeon();
    }

    _launchMatch(enemyKeys, opts) {
        if (this._game) {
            this._game.stop();
            this._game = null;
        }

        const playerDevice = pickPlayerDevice(this._deviceMgr);
        const stageKey = this._nextStage();
        const configs = [];

        configs.push({
            port: 0,
            character: 'brawler',
            deviceConfig: playerDevice,
        });

        for (let i = 0; i < enemyKeys.length; i++) {
            configs.push({
                port: i + 1,
                character: enemyKeys[i],
                type: 'ai',
                level: Math.min(10, 5 + Math.floor((this._progress.bossIndex + i) / 2)),
            });
        }

        const game = new SMASH.Game(this.canvas, configs, {
            stageKey: stageKey,
            stocks: DUNGEON_PLAYER_STOCKS,
            debug: false,
            gameMode: 'stock',
            ultimateVideos: this._ultimateVideos,
            soundsEnabled: this._soundsEnabled,
            onExit: () => {
                this._saveProgress();
                this._exitToMenu();
            },
        });

        game._suppressGameOverMenu = true;
        game._tickGameOver = () => {
            // Keep showing the game-over overlay without menu input.
        };

        const originalRender = game._render.bind(game);
        game._render = () => {
            originalRender();
            this._renderDungeonOverlay(game.ctx, opts);
        };

        game.start();
        this._game = game;

        // Apply Lazer perks and enforce boss stocks.
        const player = game.players.find(p => p.port === 0);
        if (player && player.fighter) {
            applyLazerPerks(player.fighter, this._progress.level);
            player.fighter.stocks = DUNGEON_PLAYER_STOCKS;
            player.characterKey = player.fighter.data.key;
        }

        for (let i = 1; i < game.players.length; i++) {
            const enemy = game.players[i].fighter;
            if (!enemy) continue;
            enemy.stocks = DUNGEON_BOSS_STOCKS;
        }

        if (opts && opts.isCell) {
            const cell = game.players.find(p => p.port === 1);
            if (cell && cell.fighter) {
                const phase = opts.cellPhase || 1;
                cell.fighter.stocks = this._getCellPhaseStocks(phase);
                this._cellUltBaseline = cell.fighter._ultimatesUsed || 0;
                const data = buildCellData(cell.fighter.data.key);
                cell.fighter.data = data;
                cell.fighter.width = data.width;
                cell.fighter.height = data.height;
                cell.fighter.jumpsRemaining = data.maxJumps;
            }
        }
    }

    _nextStage() {
        const idx = this._progress.stageIndex % this._stages.length;
        const key = this._stages[idx] || 'battlefield';
        this._progress.stageIndex = (this._progress.stageIndex + 1) % this._stages.length;
        return key;
    }

    _tickCellPhase() {
        if (!this._game) return;
        const cellPlayer = this._game.players.find(p => p.port === 1);
        if (!cellPlayer || !cellPlayer.fighter) return;
        const cell = cellPlayer.fighter;
        const phase = this._progress.cellPhase || 1;

        if (phase === 1 || phase === 2) {
            if ((cell._ultimatesUsed || 0) > this._cellUltBaseline) {
                this._advanceCellPhase(phase + 1);
            }
        }
    }

    _advanceCellPhase(nextPhase) {
        if (this._game) {
            this._game.stop();
            this._game = null;
        }
        this._progress.cellPhase = Math.min(4, nextPhase);
        this._saveProgress();
        this._startNextEncounter();
    }

    _getCellPhaseKey(phase) {
        switch (phase) {
            case 1: return 'cell';
            case 2: return 'cell_semi';
            case 3: return 'cell_perfect';
            case 4: return 'super_perfect_cell';
            default: return 'super_perfect_cell';
        }
    }

    _getCellPhaseStocks(phase) {
        switch (phase) {
            case 1:
            case 2:
                return 99;
            case 3:
                return 3;
            case 4:
                return 4;
            default:
                return CELL_STOCKS;
        }
    }

    _handleMatchEnd() {
        if (!this._game) return;
        const winner = this._game._winner;
        const playerWon = winner && winner.port === 0;

        if (!playerWon) {
            this._saveProgress();
            this._exitToMenu();
            return;
        }

        const phase = this._progress.phase;
        let finishDungeon = false;
        if (phase === 'boss') {
            this._grantXp(XP_REWARDS.boss);
            this._progress.bossIndex++;
            if (this._progress.bossIndex >= this._bossKeys.length) {
                this._progress.phase = 'gauntlet';
                this._progress.gauntletWave = 0;
            }
        } else if (phase === 'gauntlet') {
            this._grantXp(XP_REWARDS.gauntletWave);
            this._progress.gauntletWave++;
            if (this._progress.gauntletWave >= this._gauntletWaves.length) {
                this._progress.phase = 'cell';
                this._progress.cellPhase = 1;
            }
        } else if (phase === 'cell') {
            const cellPhase = this._progress.cellPhase || 1;
            if (cellPhase < 4) {
                if (playerWon && cellPhase === 3) {
                    this._progress.cellPhase = 4;
                    this._saveProgress();
                    this._playDungeonVideo(CELL_PHASE3_END_VIDEO, () => {
                        this._startNextEncounter();
                    });
                    return;
                }
                if (!playerWon) {
                    this._saveProgress();
                    this._exitToMenu();
                    return;
                }
            } else {
                if (playerWon) {
                    this._grantXp(XP_REWARDS.cell);
                    this._progress.cellUnlocked = true;
                    if (SMASH.Unlocks && SMASH.Unlocks.unlockCharacter) {
                        SMASH.Unlocks.unlockCharacter('super_perfect_cell');
                    }
                    finishDungeon = true;
                } else {
                    this._saveProgress();
                    this._exitToMenu();
                    return;
                }
            }
        }

        const proceed = () => {
            if (finishDungeon) {
                this._finishDungeon();
                return;
            }
            this._saveProgress();
            this._startNextEncounter();
        };

        if (this._pendingUltraTransform && !this._progress.ultraTransformPlayed) {
            this._pendingUltraTransform = false;
            this._progress.ultraTransformPlayed = true;
            this._saveProgress();
            this._playTransformVideo(proceed);
            return;
        }

        proceed();
    }

    _grantXp(amount) {
        if (!amount) return;
        const prevLevel = this._progress.level;
        this._progress.xp += amount;
        const nextLevel = getLevelForXp(this._progress.xp);
        if (nextLevel > prevLevel) {
            this._progress.level = nextLevel;
            this._levelUpLines = LEVEL_PERKS[nextLevel] || ['Level Up'];
            this._levelUpTimer = 3.2;
            if (nextLevel >= LEVEL_CAP && !this._progress.ultraUnlocked) {
                this._progress.ultraUnlocked = true;
                this._pendingUltraTransform = true;
                if (SMASH.Unlocks && SMASH.Unlocks.unlockCharacter) {
                    SMASH.Unlocks.unlockCharacter('ultra_lazer');
                }
            }
        }
    }

    _createTransformVideoElement() {
        const existing = document.getElementById('dungeonTransformVideo');
        if (existing) return existing;
        const el = document.createElement('video');
        el.id = 'dungeonTransformVideo';
        el.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100vw',
            'height: 100vh',
            'object-fit: cover',
            'z-index: 650',
            'display: none',
            'background: #000',
            'pointer-events: none',
        ].join(';');
        el.playsInline = true;
        el.preload = 'auto';
        document.body.appendChild(el);
        return el;
    }

    _playDungeonVideo(path, onDone) {
        const el = this._transformVideoEl;
        if (!el) {
            if (onDone) onDone();
            return;
        }

        if (this._game) {
            this._game.stop();
            this._game = null;
        }

        if (SMASH.Music && SMASH.Music.stop) {
            SMASH.Music.stop();
        }

        this._transformPlaying = true;
        el.muted = !this._soundsEnabled;
        el.src = path;
        el.currentTime = 0;
        el.style.display = 'block';

        const finish = () => {
            if (!this._transformPlaying) return;
            this._transformPlaying = false;
            el.pause();
            el.style.display = 'none';
            el.removeAttribute('src');
            el.load();
            if (SMASH.Music && SMASH.Music.play) {
                SMASH.Music.play('battle');
            }
            if (onDone) onDone();
        };

        el.addEventListener('ended', finish, { once: true });
        el.addEventListener('error', finish, { once: true });

        const p = el.play();
        if (p && p.catch) {
            p.catch(() => {
                setTimeout(finish, 200);
            });
        }
    }

    _playTransformVideo(onDone) {
        this._playDungeonVideo(ULTRA_TRANSFORM_VIDEO, onDone);
    }

    _renderDungeonOverlay(ctx, opts) {
        if (!ctx) return;
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const boxX = 14;
        const boxY = 12;
        const boxW = 320;
        const boxH = 76;

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 10);
        ctx.fill();

        const level = this._progress.level;
        const xp = this._progress.xp;
        const nextXp = getXpForNextLevel(level);
        const ratio = nextXp > 0 ? Math.min(1, xp / nextXp) : 1;

        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`Dungeon — Level ${level}`, boxX + 12, boxY + 10);

        ctx.font = '12px Arial';
        ctx.fillStyle = '#cfd6ff';
        ctx.fillText(`XP ${xp} / ${nextXp}`, boxX + 12, boxY + 32);

        const barX = boxX + 12;
        const barY = boxY + 52;
        const barW = boxW - 24;
        const barH = 10;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#44dd88';
        ctx.fillRect(barX, barY, Math.max(4, barW * ratio), barH);

        if (this._levelUpTimer > 0) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#44dd88';
            ctx.fillText('LEVEL UP!', S.W / 2, 80);
            ctx.font = '14px Arial';
            ctx.fillStyle = '#e6ffea';
            const lines = this._levelUpLines || [];
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], S.W / 2, 105 + i * 18);
            }
        }

        const label = this._getPhaseLabel(opts);
        if (label) {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, S.W - 16, 14);
        }

        ctx.restore();
    }

    _getPhaseLabel(opts) {
        if (!opts) return '';
        if (this._progress.phase === 'boss') {
            const name = this._bossNames[this._progress.bossIndex] || 'Boss';
            return `Boss: ${name}`;
        }
        if (this._progress.phase === 'gauntlet') {
            const total = this._gauntletWaves.length || 0;
            const idx = Math.min(this._progress.gauntletWave + 1, total || 1);
            return `Gauntlet Wave ${idx}/${total}`;
        }
        if (this._progress.phase === 'cell') {
            return 'Final Boss: Cell';
        }
        return '';
    }

    _saveProgress() {
        saveProgress(this._progress);
    }

    _exitToMenu() {
        if (this._game) {
            this._game.stop();
            this._game = null;
        }
        if (this._onBack) this._onBack();
    }

    _finishDungeon() {
        clearProgress();
        this._exitToMenu();
    }
}

SMASH.DungeonScene = DungeonScene;
SMASH.Dungeon = {
    SAVE_KEY: DUNGEON_SAVE_KEY,
    hasSave: hasSave,
    clear: clearProgress,
};
})();
