/**
 * MultiplayerScene.js — LAN multiplayer lobby + match.
 * Supports 2-4 players, all game modes.
 *
 * ══════════════════════════════════════════════════════════════════
 *  FLOW
 * ══════════════════════════════════════════════════════════════════
 *  1. Connection screen (host / join)
 *  2. Lobby — character select, mode/stage pick (host), team pick
 *  3. Match — host runs simulation, guests render via applyState
 *  4. Result — rematch or leave
 * ══════════════════════════════════════════════════════════════════
 */
(function () {
const S = SMASH.Settings;
const MAX_PLAYERS = 4;

const PHASE = {
    CONNECT: 'connect',
    SETUP:   'setup',
    LOBBY:   'lobby',
    PLAYING: 'playing',
    RESULT:  'result',
};

const GAME_MODES = ['stock', 'stamina', 'team', 'wave', 'draft', 'tournament'];
const MODE_LABELS = {
    stock: 'Stock', stamina: 'Stamina', team: 'Team Battle',
    wave: 'Wave Defense', draft: 'Draft', tournament: 'Tournament',
};

const STAGES = ['battlefield', 'final_destination', 'wide_arena', 'sky_fortress', 'crystal_caverns', 'orbital_station'];
const STAGE_LABELS = {
    battlefield: 'Battlefield', final_destination: 'Final Destination',
    wide_arena: 'Wide Arena', sky_fortress: 'Sky Fortress',
    crystal_caverns: 'Crystal Caverns', orbital_station: 'Orbital Station',
};

const TEAM_COLORS = ['#f44', '#44f', '#0c6', '#fa0'];
const TEAM_NAMES  = ['Red', 'Blue', 'Green', 'Orange'];
const DRAFT_QUEUE_SIZE = 3;

class MultiplayerScene {
    constructor(canvas, options) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');

        this._onBack    = (options && options.onBack) || null;
        this._deviceMgr = (options && options.deviceMgr) || null;

        this._phase     = PHASE.CONNECT;
        this._ws        = null;
        this._mySlot    = -1;
        this._maxPlayers = MAX_PLAYERS;
        this._connected = false;

        // ── Connection form ────────────────────────────────────────
        this._connectMode   = 'menu';     // 'menu' | 'joining'
        this._connectCursor = 0;
        const loc = window.location;
        const served = loc.protocol.startsWith('http');
        this._ipInput       = served ? loc.hostname : 'localhost';
        this._portInput     = served ? (loc.port || '80') : '7777';
        this._editingField  = -1;
        this._connectError  = '';
        this._connectStatus = '';

        // ── Lobby state (per-slot arrays) ──────────────────────────
        this._allKeys   = SMASH.getCharacterKeys();
        this._cursor    = 0;
        this._myName    = 'Player';

        // Per-slot state (indexed 0..3)
        this._slotChars = new Array(MAX_PLAYERS).fill(null);
        this._slotReady = new Array(MAX_PLAYERS).fill(false);
        this._slotNames = new Array(MAX_PLAYERS).fill('');
        this._slotTeams = new Array(MAX_PLAYERS).fill(-1);
        this._slotConnected = new Array(MAX_PLAYERS).fill(false);
        this._slotCharQueues = [[], [], [], []]; // for draft mode

        // Mode/stage (host controls)
        this._gameMode  = 'stock';
        this._modeOpts  = {};
        this._stageKey  = 'battlefield';
        this._lobbySection = 'char';  // 'char' | 'team'
        this._setupSection = 'mode';  // 'mode' | 'stage' (setup phase)
        this._modeCursor   = 0;
        this._stageCursor  = 0;
        this._teamCursor   = 0;

        // ── Match state ────────────────────────────────────────────
        this._activeGame      = null;
        this._netControllers  = {};    // slot -> NetworkController (host only)
        this._localController = null;
        this._lastLocalInput  = null;
        this._guestInputPoll  = null;
        this._guestGameOverTimer = 0;

        // ── Result ─────────────────────────────────────────────────
        this._resultWinner = null;
        this._resultChars  = [];
        this._rematchRequested = new Array(MAX_PLAYERS).fill(false);
        this._readySlots = [];

        // ── Input ──────────────────────────────────────────────────
        this._mk  = {};
        this._mkp = {};
        this._onKD = e => {
            this._mk[e.code] = true;
            if (this._phase === PHASE.CONNECT && this._editingField >= 0) {
                this._handleTextInput(e);
                e.preventDefault();
            }
        };
        this._onKU = e => { this._mk[e.code] = false; };
        window.addEventListener('keydown', this._onKD);
        window.addEventListener('keyup',   this._onKU);

        this._running = false;
        this._raf     = null;
    }

    _jp(code) { return !!this._mk[code] && !this._mkp[code]; }

    // ═════════════════════════════════════════════════════════════
    //  TEXT INPUT
    // ═════════════════════════════════════════════════════════════

    _handleTextInput(e) {
        const field = this._editingField;
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { this._editingField = -1; return; }
        if (e.code === 'Tab') { this._editingField = field === 0 ? 1 : 0; return; }
        if (e.code === 'Escape') { this._editingField = -1; return; }

        const isIP = field === 0;
        let val = isIP ? this._ipInput : this._portInput;

        if (e.code === 'Backspace') {
            val = val.slice(0, -1);
        } else if (e.key && e.key.length === 1) {
            if (isIP) { if (/[a-zA-Z0-9.:\-]/.test(e.key)) val += e.key; }
            else      { if (/[0-9]/.test(e.key) && val.length < 5) val += e.key; }
        }

        if (isIP) this._ipInput = val; else this._portInput = val;
    }

    // ═════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ═════════════════════════════════════════════════════════════

    start() { this._running = true; this._loop(performance.now()); }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this._activeGame) { this._activeGame.stop(); this._activeGame = null; }
        if (this._ws) { try { this._ws.close(); } catch {} this._ws = null; }
        window.removeEventListener('keydown', this._onKD);
        window.removeEventListener('keyup',   this._onKU);
    }

    _loop(now) {
        if (!this._running) return;

        if (this._activeGame) {
            // GUEST: manually poll to capture input
            if (this._guestInputPoll) {
                this._guestInputPoll.poll();
            }
            this._flushCapturedInput();

            // -- guest clearFrame so phantom presses don't accumulate --
            if (this._mySlot !== 0) {
                SMASH.InputManager.clearFrame();
            }

            // HOST: serialize + broadcast state every frame
            if (this._mySlot === 0 && this._activeGame._running) {
                const state = this._activeGame.serializeState();
                this._send({ type: 'gameState', state });
            }

            // GUEST: game-over auto-exit
            if (this._mySlot !== 0 && this._activeGame && this._activeGame.state === 'gameover') {
                this._guestGameOverTimer = (this._guestGameOverTimer || 0) + 1;
                if (this._guestGameOverTimer > 120) {
                    this._guestGameOverTimer = 0;
                    const g = this._activeGame;
                    g.stop();
                    if (g.onExit) g.onExit('mp');
                }
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
    //  WEBSOCKET
    // ═════════════════════════════════════════════════════════════

    _connect(host, port) {
        this._connectStatus = 'Connecting...';
        this._connectError  = '';
        try { this._ws = new WebSocket(`ws://${host}:${port}`); }
        catch (e) { this._connectError = 'Invalid address'; this._connectStatus = ''; return; }

        this._ws.onopen = () => {
            this._connected = true;
            this._connectStatus = '';
            this._ws.send(JSON.stringify({ type: 'join', name: this._myName }));
        };
        this._ws.onmessage = (evt) => {
            let msg; try { msg = JSON.parse(evt.data); } catch { return; }
            this._onMessage(msg);
        };
        this._ws.onerror = () => {
            this._connectError = 'Connection failed - is the server running?';
            this._connectStatus = ''; this._connected = false;
        };
        this._ws.onclose = () => {
            if (this._phase === PHASE.PLAYING && this._activeGame) {
                this._activeGame.stop(); this._activeGame = null;
            }
            if (this._phase !== PHASE.CONNECT) {
                this._connectError = 'Disconnected from server';
                this._phase = PHASE.CONNECT; this._connectMode = 'menu';
            }
            this._connected = false; this._ws = null;
        };
    }

    _send(obj) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN)
            this._ws.send(JSON.stringify(obj));
    }

    _onMessage(msg) {
        switch (msg.type) {
            case 'welcome':
                this._mySlot = msg.slot;
                this._maxPlayers = msg.maxPlayers || MAX_PLAYERS;
                if (msg.room) {
                    for (let i = 0; i < MAX_PLAYERS; i++) {
                        this._slotChars[i] = msg.room.chars[i] || null;
                        this._slotReady[i] = msg.room.ready[i] || false;
                        this._slotNames[i] = msg.room.names[i] || '';
                        this._slotTeams[i] = msg.room.teams[i] != null ? msg.room.teams[i] : -1;
                        this._slotConnected[i] = !!msg.room.names[i];
                        this._slotCharQueues[i] = (msg.room.charQueues && msg.room.charQueues[i]) || [];
                    }
                    this._slotConnected[msg.slot] = true;
                    this._gameMode = msg.room.mode || 'stock';
                    this._stageKey = msg.room.stage || 'battlefield';
                    this._modeCursor = GAME_MODES.indexOf(this._gameMode);
                    this._stageCursor = STAGES.indexOf(this._stageKey);
                }
                this._phase = (msg.room && msg.room.phase === 'lobby') ? PHASE.LOBBY : PHASE.SETUP;
                SMASH.Music.play('multiplayer');
                break;

            case 'playerJoined':
                this._slotNames[msg.slot] = msg.name || ('Player ' + (msg.slot + 1));
                this._slotConnected[msg.slot] = true;
                break;

            case 'playerLeft':
                this._slotChars[msg.slot] = null;
                this._slotReady[msg.slot] = false;
                this._slotNames[msg.slot] = '';
                this._slotTeams[msg.slot] = -1;
                this._slotConnected[msg.slot] = false;
                if (this._phase === PHASE.PLAYING && this._activeGame) {
                    this._activeGame.stop(); this._activeGame = null;
                }
                if (this._phase === PHASE.PLAYING) this._phase = PHASE.LOBBY;
                break;

            case 'charUpdate':
                this._slotChars[msg.slot] = msg.char;
                break;

            case 'readyUpdate':
                this._slotReady[msg.slot] = msg.ready;
                break;

            case 'teamUpdate':
                this._slotTeams[msg.slot] = msg.team;
                break;

            case 'modeUpdate':
                this._gameMode = msg.mode || 'stock';
                this._modeOpts = msg.modeOpts || {};
                this._modeCursor = GAME_MODES.indexOf(this._gameMode);
                break;

            case 'stageUpdate':
                this._stageKey = msg.stage || 'battlefield';
                this._stageCursor = STAGES.indexOf(this._stageKey);
                break;

            case 'setupDone':
                this._phase = PHASE.LOBBY;
                SMASH.Music.play('multiplayer');
                for (let i = 0; i < MAX_PLAYERS; i++) {
                    this._slotChars[i] = null;
                    this._slotReady[i] = false;
                    this._slotCharQueues[i] = [];
                }
                this._lobbySection = 'char';
                this._cursor = 0;
                break;

            case 'draftUpdate':
                this._slotCharQueues[msg.slot] = msg.chars || [];
                this._slotChars[msg.slot] = (msg.chars && msg.chars.length > 0) ? msg.chars[0] : null;
                break;

            case 'matchStart':
                this._startMatch(msg);
                break;

            case 'remoteInput':
                // HOST: apply remote player's input to their NetworkController
                if (this._mySlot === 0 && this._netControllers[msg.slot]) {
                    this._netControllers[msg.slot].applyRemoteInput(msg.input);
                }
                break;

            case 'gameState':
                // GUEST: apply authoritative game state
                if (this._mySlot !== 0 && this._activeGame && msg.state) {
                    this._activeGame.applyState(msg.state);
                }
                break;

            case 'rematchRequest':
                this._rematchRequested[msg.slot] = true;
                break;

            case 'error':
                this._connectError = msg.msg;
                break;
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  INPUT RELAY
    // ═════════════════════════════════════════════════════════════

    _wrapLocalController(ctrl) {
        const self = this;
        const origPoll = ctrl.poll.bind(ctrl);
        ctrl.poll = function () {
            const raw = origPoll();
            const inp = raw.input || raw;
            self._lastLocalInput = {
                moveX: inp.moveX, moveY: inp.moveY,
                jump: inp.jump, attack: inp.attack,
                special: inp.special, shield: inp.shield, grab: inp.grab,
            };
            return raw;
        };
    }

    _flushCapturedInput() {
        if (this._lastLocalInput && this._ws) {
            this._send({ type: 'input', input: this._lastLocalInput });
            this._lastLocalInput = null;
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  MATCH LAUNCH
    // ═════════════════════════════════════════════════════════════

    _startMatch(msg) {
        this._phase = PHASE.PLAYING;
        SMASH.Music.play('battle');
        this._resultChars = msg.chars;
        this._readySlots = msg.readySlots || [];

        const isHost = this._mySlot === 0;
        const readySlots = msg.readySlots || [];

        // Create NetworkControllers for each remote player (host only)
        this._netControllers = {};
        if (isHost) {
            for (const slot of readySlots) {
                if (slot !== 0) {
                    this._netControllers[slot] = new SMASH.NetworkController();
                }
            }
        }

        // Build player configs - one per ready slot
        const configs = [];
        for (const slot of readySlots) {
            const isLocal = slot === this._mySlot;
            configs.push({
                port:       slot,
                character:  msg.chars[slot],
                type:       isLocal ? 'network_local' : 'network_remote',
                team:       msg.teams[slot] != null ? msg.teams[slot] : -1,
                deviceConfig: (isHost && isLocal)
                    ? { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: 'wasd' }
                    : null,
                _netController: (isHost && !isLocal) ? this._netControllers[slot] : null,
            });
        }

        const mode = msg.mode || 'stock';
        const self = this;

        const gameSettings = {
            stageKey:  msg.stage || 'battlefield',
            stocks:    (mode === 'stamina' || mode === 'wave' || mode === 'draft') ? 1 : 3,
            staminaHP: (msg.modeOpts && msg.modeOpts.staminaHP) || 150,
            debug:     false,
            gameMode:  mode === 'tournament' ? 'stock' : mode,
            guestMode: !isHost,
            onExit: function (reason) {
                self._activeGame = null;
                self._netControllers = {};
                self._localController = null;
                self._guestInputPoll = null;
                self._guestGameOverTimer = 0;

                if (reason === 'menu' || reason === 'charSelect') {
                    self._send({ type: 'leave' });
                    if (self._ws) { self._ws.close(); self._ws = null; }
                    self.stop();
                    if (self._onBack) self._onBack();
                    return;
                }

                // Try to find winner from game
                let winnerSlot = -1;
                if (game._winner && game._winner.port != null) {
                    winnerSlot = game._winner.port;
                } else if (game._winTeam >= 0) {
                    // Team win: find first alive fighter on winning team
                    for (const f of game.fighters) {
                        if (f.team === game._winTeam && f.isAlive) { winnerSlot = f.port; break; }
                    }
                } else {
                    // Fallback: find last alive fighter
                    for (const f of game.fighters) {
                        if (f.isAlive && !game._waveEnemies.includes(f)) { winnerSlot = f.port; break; }
                    }
                }
                self._resultWinner = winnerSlot;
                self._rematchRequested = new Array(MAX_PLAYERS).fill(false);
                self._phase = PHASE.RESULT;
                SMASH.Music.play('multiplayer');
            },
        };

        const game = new SMASH.Game(this.canvas, configs, gameSettings);

        // HOST: wrap local controller for input relay
        if (isHost) {
            for (const p of game.players) {
                if (p.port === this._mySlot) {
                    this._localController = p.controller;
                    this._wrapLocalController(p.controller);
                }
            }
        } else {
            // GUEST: create InputManager for local keyboard capture
            const guestCtrl = new SMASH.InputManager(
                { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: 'wasd' }
            );
            this._localController = guestCtrl;
            this._wrapLocalController(guestCtrl);
            this._guestInputPoll = guestCtrl;
        }

        // Override _tickGameOver for auto back-to-lobby
        game._tickGameOver = () => {
            if (!game._autoExitTimer) game._autoExitTimer = 0;
            game._autoExitTimer++;
            if (game._autoExitTimer > 120) {
                game.stop();
                if (game.onExit) game.onExit('mp');
            }
        };

        // Draft queues
        if (mode === 'draft' && msg.charQueues) {
            const allQ = [];
            for (let i = 0; i < readySlots.length; i++) {
                const sl = readySlots[i];
                const q = msg.charQueues[sl] || [];
                allQ.push(q.slice(1));
            }
            game.setDraftQueues(allQ);
        }

        game.start();
        game._suppressGameOverMenu = true;
        this._activeGame = game;
    }

    // ═════════════════════════════════════════════════════════════
    //  UPDATE DISPATCH
    // ═════════════════════════════════════════════════════════════

    _update() {
        switch (this._phase) {
            case PHASE.CONNECT: return this._tickConnect();
            case PHASE.SETUP:   return this._tickSetup();
            case PHASE.LOBBY:   return this._tickLobby();
            case PHASE.RESULT:  return this._tickResult();
        }
    }

    // ── Connect ──────────────────────────────────────────────────
    _tickConnect() {
        if (this._jp('Escape')) {
            if (this._editingField >= 0) { this._editingField = -1; return; }
            this.stop();
            if (this._onBack) this._onBack();
            return;
        }
        if (this._editingField >= 0) return;

        if (this._connectMode === 'menu') {
            if (this._jp('ArrowUp') || this._jp('KeyW'))
                this._connectCursor = Math.max(0, this._connectCursor - 1);
            if (this._jp('ArrowDown') || this._jp('KeyS'))
                this._connectCursor = Math.min(1, this._connectCursor + 1);

            if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
                if (this._connectCursor === 0) {
                    this._myName = 'Host';
                    this._connect(this._ipInput, this._portInput || '7777');
                } else {
                    this._connectMode = 'joining';
                    this._myName = 'Guest';
                    this._editingField = 0;
                }
            }
        } else if (this._connectMode === 'joining') {
            if (this._jp('Backspace') && this._editingField < 0) {
                this._connectMode = 'menu'; this._connectError = ''; return;
            }
            if ((this._jp('Enter') || this._jp('NumpadEnter')) && this._editingField < 0) {
                this._connect(this._ipInput || 'localhost', this._portInput || '7777');
            }
        }
    }

    // ── Setup ────────────────────────────────────────────────────
    _tickSetup() {
        if (this._jp('Escape')) {
            this._send({ type: 'leave' });
            if (this._ws) { this._ws.close(); this._ws = null; }
            this._phase = PHASE.CONNECT;
            this._connected = false;
            this._connectMode = 'menu';
            this._resetLobbyState();
            return;
        }

        const isHost = this._mySlot === 0;
        if (!isHost) return;

        if (this._jp('Tab')) {
            this._setupSection = this._setupSection === 'mode' ? 'stage' : 'mode';
            return;
        }

        if (this._setupSection === 'mode') {
            let changed = false;
            if (this._jp('ArrowUp') || this._jp('KeyW')) {
                this._modeCursor = Math.max(0, this._modeCursor - 1); changed = true;
            }
            if (this._jp('ArrowDown') || this._jp('KeyS')) {
                this._modeCursor = Math.min(GAME_MODES.length - 1, this._modeCursor + 1); changed = true;
            }
            if (changed) {
                this._gameMode = GAME_MODES[this._modeCursor];
                this._send({ type: 'modeSelect', mode: this._gameMode, modeOpts: this._modeOpts });
            }
        } else {
            let changed = false;
            if (this._jp('ArrowUp') || this._jp('KeyW')) {
                this._stageCursor = Math.max(0, this._stageCursor - 1); changed = true;
            }
            if (this._jp('ArrowDown') || this._jp('KeyS')) {
                this._stageCursor = Math.min(STAGES.length - 1, this._stageCursor + 1); changed = true;
            }
            if (changed) {
                this._stageKey = STAGES[this._stageCursor];
                this._send({ type: 'stageSelect', stage: this._stageKey });
            }
        }

        if (this._jp('Enter') || this._jp('NumpadEnter')) {
            this._send({ type: 'modeSelect', mode: this._gameMode, modeOpts: this._modeOpts });
            this._send({ type: 'stageSelect', stage: this._stageKey });
            this._send({ type: 'setupDone' });
        }
    }

    // ── Lobby ────────────────────────────────────────────────────
    _tickLobby() {
        if (this._jp('Escape')) {
            this._send({ type: 'leave' });
            if (this._ws) { this._ws.close(); this._ws = null; }
            this._phase = PHASE.CONNECT;
            this._connected = false;
            this._connectMode = 'menu';
            this._resetLobbyState();
            return;
        }

        const isHost = this._mySlot === 0;
        const myReady = this._slotReady[this._mySlot];

        // Tab to switch sections: char / team
        if (this._jp('Tab') && !myReady) {
            const sections = ['char'];
            if (this._gameMode === 'team') sections.push('team');
            const idx = sections.indexOf(this._lobbySection);
            this._lobbySection = sections[(idx + 1) % sections.length];
            return;
        }

        if (myReady) {
            // Unready
            if (this._jp('Backspace')) {
                this._slotReady[this._mySlot] = false;
                this._send({ type: 'unready' });
                return;
            }
            // Host start
            if (isHost && (this._jp('Enter') || this._jp('NumpadEnter'))) {
                const readyCount = this._slotReady.filter((r, i) => r && this._slotConnected[i]).length;
                if (readyCount >= 2) {
                    this._send({ type: 'start', stage: this._stageKey });
                }
            }
            return;
        }

        // Section-specific input
        switch (this._lobbySection) {
            case 'char': this._tickCharSelect(); break;
            case 'mode': this._tickModeSelect(); break;
            case 'stage': this._tickStageSelect(); break;
            case 'team': this._tickTeamSelect(); break;
        }
    }

    _tickCharSelect() {
        const keys = this._allKeys;
        const cols = 8;
        if (this._jp('ArrowLeft')  || this._jp('KeyA')) this._cursor = Math.max(0, this._cursor - 1);
        if (this._jp('ArrowRight') || this._jp('KeyD')) this._cursor = Math.min(keys.length - 1, this._cursor + 1);
        if (this._jp('ArrowUp')    || this._jp('KeyW')) this._cursor = Math.max(0, this._cursor - cols);
        if (this._jp('ArrowDown')  || this._jp('KeyS')) this._cursor = Math.min(keys.length - 1, this._cursor + cols);

        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            const picked = keys[this._cursor];

            if (this._gameMode === 'draft') {
                // Draft mode: build a queue of characters
                const queue = this._slotCharQueues[this._mySlot];
                if (queue.length < DRAFT_QUEUE_SIZE) {
                    queue.push(picked);
                    this._slotChars[this._mySlot] = queue[0];
                    this._send({ type: 'draftSelect', chars: [...queue] });
                    if (queue.length >= DRAFT_QUEUE_SIZE) {
                        this._slotReady[this._mySlot] = true;
                        if (SMASH.SFX) {
                            SMASH.SFX.playCharacterSelect(this._slotChars[this._mySlot]);
                            SMASH.SFX.playSelectAny();
                        }
                        this._send({ type: 'ready' });
                    }
                }
            } else {
                if (!this._slotChars[this._mySlot] || this._slotChars[this._mySlot] !== picked) {
                    this._slotChars[this._mySlot] = picked;
                    this._send({ type: 'charSelect', char: picked });
                } else {
                    // Already selected - confirm = ready
                    this._slotReady[this._mySlot] = true;
                    if (SMASH.SFX) {
                        SMASH.SFX.playCharacterSelect(picked);
                        SMASH.SFX.playSelectAny();
                    }
                    this._send({ type: 'ready' });
                }
            }
        }

        // Draft mode: Backspace to undo last pick
        if (this._gameMode === 'draft' && this._jp('Backspace')) {
            const queue = this._slotCharQueues[this._mySlot];
            if (queue.length > 0) {
                if (this._slotReady[this._mySlot]) {
                    this._slotReady[this._mySlot] = false;
                    this._send({ type: 'unready' });
                }
                queue.pop();
                this._slotChars[this._mySlot] = queue.length > 0 ? queue[0] : null;
                this._send({ type: 'draftSelect', chars: [...queue] });
            }
        }
    }

    _tickModeSelect() {
        if (this._jp('ArrowUp') || this._jp('KeyW'))
            this._modeCursor = Math.max(0, this._modeCursor - 1);
        if (this._jp('ArrowDown') || this._jp('KeyS'))
            this._modeCursor = Math.min(GAME_MODES.length - 1, this._modeCursor + 1);
        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            this._gameMode = GAME_MODES[this._modeCursor];
            this._send({ type: 'modeSelect', mode: this._gameMode, modeOpts: this._modeOpts });
        }
    }

    _tickStageSelect() {
        if (this._jp('ArrowUp') || this._jp('KeyW'))
            this._stageCursor = Math.max(0, this._stageCursor - 1);
        if (this._jp('ArrowDown') || this._jp('KeyS'))
            this._stageCursor = Math.min(STAGES.length - 1, this._stageCursor + 1);
        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            this._stageKey = STAGES[this._stageCursor];
            this._send({ type: 'stageSelect', stage: this._stageKey });
        }
    }

    _tickTeamSelect() {
        if (this._jp('ArrowUp') || this._jp('KeyW'))
            this._teamCursor = Math.max(0, this._teamCursor - 1);
        if (this._jp('ArrowDown') || this._jp('KeyS'))
            this._teamCursor = Math.min(3, this._teamCursor + 1);
        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            this._slotTeams[this._mySlot] = this._teamCursor;
            this._send({ type: 'teamSelect', team: this._teamCursor });
        }
    }

    _resetLobbyState() {
        for (let i = 0; i < MAX_PLAYERS; i++) {
            this._slotChars[i] = null;
            this._slotReady[i] = false;
            this._slotNames[i] = '';
            this._slotTeams[i] = -1;
            this._slotConnected[i] = false;
            this._slotCharQueues[i] = [];
        }
        this._lobbySection = 'char';
    }

    // ── Result ───────────────────────────────────────────────────
    _tickResult() {
        if (this._jp('Escape')) {
            this._send({ type: 'leave' });
            if (this._ws) { this._ws.close(); this._ws = null; }
            this.stop();
            if (this._onBack) this._onBack();
            return;
        }

        if (this._jp('Enter') || this._jp('NumpadEnter') || this._jp('Space')) {
            if (!this._rematchRequested[this._mySlot]) {
                this._rematchRequested[this._mySlot] = true;
                this._send({ type: 'rematch' });
            }
            // Check if all connected players want rematch
            const allWant = this._readySlots.length >= 2 && this._readySlots.every(s => this._rematchRequested[s]);
            if (allWant) {
                for (let i = 0; i < MAX_PLAYERS; i++) this._slotReady[i] = false;
                this._phase = PHASE.LOBBY;
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  RENDER
    // ═════════════════════════════════════════════════════════════

    _render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, S.W, S.H);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, S.W, S.H);

        switch (this._phase) {
            case PHASE.CONNECT: return this._renderConnect(ctx);
            case PHASE.SETUP:   return this._renderSetup(ctx);
            case PHASE.LOBBY:   return this._renderLobby(ctx);
            case PHASE.RESULT:  return this._renderResult(ctx);
        }
    }

    // ── Connect ──────────────────────────────────────────────────
    _renderConnect(ctx) {
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('MULTIPLAYER', S.W / 2, 60);

        ctx.font = '16px Arial';
        ctx.fillStyle = '#888';
        ctx.fillText('LAN Online - Up to 4 players', S.W / 2, 105);

        if (this._connectMode === 'menu') {
            const opts = ['HOST GAME', 'JOIN GAME'];
            for (let i = 0; i < opts.length; i++) {
                const y = 200 + i * 80;
                const sel = i === this._connectCursor;
                ctx.fillStyle = sel ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)';
                ctx.beginPath(); ctx.roundRect(S.W / 2 - 200, y - 30, 400, 60, 10); ctx.fill();
                if (sel) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke(); }
                ctx.font = 'bold 28px Arial';
                ctx.fillStyle = sel ? '#ffd700' : '#aaa';
                ctx.fillText(opts[i], S.W / 2, y);
            }
            ctx.font = '14px Arial'; ctx.fillStyle = '#666';
            ctx.fillText('HOST: Run "node server/multiplayer-server.js" then click Host', S.W / 2, 400);
            ctx.fillText('JOIN: Enter the host\'s IP address and port', S.W / 2, 425);
            ctx.fillText('Up to 4 players on the same network', S.W / 2, 450);
        } else if (this._connectMode === 'joining') {
            ctx.font = 'bold 28px Arial'; ctx.fillStyle = '#fff';
            ctx.fillText('JOIN A GAME', S.W / 2, 180);

            const ipSel  = this._editingField === 0;
            const portSel = this._editingField === 1;

            ctx.textAlign = 'right'; ctx.font = '20px Arial'; ctx.fillStyle = '#aaa';
            ctx.fillText('IP Address:', S.W / 2 - 10, 250);
            ctx.fillText('Port:', S.W / 2 - 10, 310);
            ctx.textAlign = 'left';

            // IP box
            ctx.fillStyle = ipSel ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath(); ctx.roundRect(S.W / 2 + 10, 230, 280, 36, 6); ctx.fill();
            if (ipSel) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.font = '18px monospace'; ctx.fillStyle = '#fff';
            ctx.fillText(this._ipInput + (ipSel ? '|' : ''), S.W / 2 + 18, 250);

            // Port box
            ctx.fillStyle = portSel ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath(); ctx.roundRect(S.W / 2 + 10, 290, 120, 36, 6); ctx.fill();
            if (portSel) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.fillStyle = '#fff';
            ctx.fillText(this._portInput + (portSel ? '|' : ''), S.W / 2 + 18, 310);

            ctx.textAlign = 'center'; ctx.font = '14px Arial'; ctx.fillStyle = '#888';
            if (this._editingField < 0) {
                ctx.fillText('Click a field to edit, or press Enter to connect', S.W / 2, 370);
                ctx.fillText('Backspace: Go back', S.W / 2, 395);
                // Connect button
                ctx.fillStyle = 'rgba(0,200,100,0.2)';
                ctx.beginPath(); ctx.roundRect(S.W / 2 - 80, 430, 160, 45, 8); ctx.fill();
                ctx.strokeStyle = '#0c6'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = 'bold 22px Arial'; ctx.fillStyle = '#0c6';
                ctx.fillText('CONNECT', S.W / 2, 455);
            } else {
                ctx.fillText('Type to edit | Tab: switch | Enter: confirm | Esc: cancel', S.W / 2, 370);
            }
        }

        if (this._connectStatus) {
            ctx.font = '18px Arial'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center';
            ctx.fillText(this._connectStatus, S.W / 2, 530);
        }
        if (this._connectError) {
            ctx.font = '16px Arial'; ctx.fillStyle = '#f44'; ctx.textAlign = 'center';
            ctx.fillText(this._connectError, S.W / 2, 560);
        }
        ctx.font = '14px Arial'; ctx.fillStyle = '#555'; ctx.textAlign = 'center';
        ctx.fillText('Esc: Back to Menu', S.W / 2, S.H - 20);
    }

    // ── Setup ────────────────────────────────────────────────────
    _renderSetup(ctx) {
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        ctx.font = 'bold 42px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('GAME SETUP', S.W / 2, 50);

        const isHost = this._mySlot === 0;
        const connCount = this._slotConnected.filter(c => c).length;
        ctx.font = '15px Arial'; ctx.fillStyle = '#888';
        ctx.fillText(
            isHost
                ? 'Choose mode & stage, then press Enter  (' + connCount + ' player' + (connCount !== 1 ? 's' : '') + ' connected)'
                : 'Waiting for host to configure...  (' + connCount + ' player' + (connCount !== 1 ? 's' : '') + ' connected)',
            S.W / 2, 90
        );

        // Player bar
        for (let i = 0; i < MAX_PLAYERS; i++) {
            const px = S.W / 2 - (MAX_PLAYERS * 80) / 2 + i * 80;
            const conn = this._slotConnected[i];
            ctx.fillStyle = conn ? (i === this._mySlot ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.03)';
            ctx.beginPath(); ctx.roundRect(px, 115, 70, 30, 5); ctx.fill();
            if (i === this._mySlot && conn) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1; ctx.stroke(); }
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = conn ? (i === this._mySlot ? '#ffd700' : '#ccc') : '#333';
            ctx.fillText(conn ? (this._slotNames[i] || 'P' + (i + 1)) : '\u2014', px + 35, 131);
        }

        // Two columns
        const colW = 300;
        const gap = 60;
        const leftX = S.W / 2 - colW - gap / 2;
        const rightX = S.W / 2 + gap / 2;
        const topY = 175;

        // ── MODE column ──
        const mSel = isHost && this._setupSection === 'mode';
        ctx.font = 'bold 20px Arial'; ctx.fillStyle = mSel ? '#ffd700' : '#aaa';
        ctx.fillText('GAME MODE', leftX + colW / 2, topY);
        if (mSel) { ctx.font = '11px Arial'; ctx.fillStyle = '#666'; ctx.fillText('\u25B2\u25BC to select', leftX + colW / 2, topY + 18); }

        for (let i = 0; i < GAME_MODES.length; i++) {
            const y = topY + 42 + i * 52;
            const active = GAME_MODES[i] === this._gameMode;
            const cursor = mSel && i === this._modeCursor;
            ctx.fillStyle = active ? 'rgba(255,215,0,0.12)' : (cursor ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)');
            ctx.beginPath(); ctx.roundRect(leftX, y - 18, colW, 44, 6); ctx.fill();
            if (active) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke(); }
            else if (cursor) { ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke(); }
            ctx.font = active ? 'bold 18px Arial' : '17px Arial';
            ctx.fillStyle = active ? '#ffd700' : (cursor ? '#ddd' : '#777');
            ctx.fillText(MODE_LABELS[GAME_MODES[i]], leftX + colW / 2, y + 4);
        }

        // ── STAGE column ──
        const sSel = isHost && this._setupSection === 'stage';
        ctx.font = 'bold 20px Arial'; ctx.fillStyle = sSel ? '#ffd700' : '#aaa';
        ctx.fillText('STAGE', rightX + colW / 2, topY);
        if (sSel) { ctx.font = '11px Arial'; ctx.fillStyle = '#666'; ctx.fillText('\u25B2\u25BC to select', rightX + colW / 2, topY + 18); }

        for (let i = 0; i < STAGES.length; i++) {
            const y = topY + 42 + i * 52;
            const active = STAGES[i] === this._stageKey;
            const cursor = sSel && i === this._stageCursor;
            ctx.fillStyle = active ? 'rgba(0,200,100,0.12)' : (cursor ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)');
            ctx.beginPath(); ctx.roundRect(rightX, y - 18, colW, 44, 6); ctx.fill();
            if (active) { ctx.strokeStyle = '#0c6'; ctx.lineWidth = 2; ctx.stroke(); }
            else if (cursor) { ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke(); }
            ctx.font = active ? 'bold 18px Arial' : '17px Arial';
            ctx.fillStyle = active ? '#0c6' : (cursor ? '#ddd' : '#777');
            ctx.fillText(STAGE_LABELS[STAGES[i]], rightX + colW / 2, y + 4);
        }

        // Footer
        ctx.font = '14px Arial'; ctx.textAlign = 'center';
        if (isHost) {
            ctx.fillStyle = '#0c6';
            ctx.fillText('Tab: Switch column  |  \u25B2\u25BC Navigate  |  Enter: Continue to Character Select', S.W / 2, S.H - 40);
        }
        ctx.fillStyle = '#555';
        ctx.fillText('Esc: Disconnect', S.W / 2, S.H - 18);
    }

    // ── Lobby ────────────────────────────────────────────────────
    _renderLobby(ctx) {
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        ctx.font = 'bold 32px Arial'; ctx.fillStyle = '#ffd700';
        ctx.fillText('MULTIPLAYER \u2014 ' + (MODE_LABELS[this._gameMode] || this._gameMode).toUpperCase(), S.W / 2, 30);

        // Slot / role info
        ctx.font = '13px Arial'; ctx.fillStyle = '#888';
        const roleText = this._mySlot === 0
            ? 'HOST | Enter: Start when all ready'
            : 'GUEST | Waiting for host to start';
        ctx.fillText(roleText + '  |  Stage: ' + (STAGE_LABELS[this._stageKey] || this._stageKey), S.W / 2, 52);

        // ── Player panels (top row) ──────────────────────────────
        const panelW = (S.W - 40) / MAX_PLAYERS - 10;
        for (let i = 0; i < MAX_PLAYERS; i++) {
            const px = 20 + i * (panelW + 10);
            this._renderPlayerPanel(ctx, i, px, 65, panelW);
        }

        // ── Bottom area: char grid + side panels ─────────────────
        const gridTop = 170;

        // Left sidebar: mode + stage
        this._renderModeStageSidebar(ctx, 10, gridTop);

        // Right sidebar: team (if team mode)
        if (this._gameMode === 'team') {
            this._renderTeamSidebar(ctx, S.W - 170, gridTop);
        }

        // Character grid (center)
        this._renderCharGrid(ctx, gridTop);

        // Footer
        ctx.font = '13px Arial'; ctx.fillStyle = '#666'; ctx.textAlign = 'center';
        const myReady = this._slotReady[this._mySlot];
        if (myReady) {
            const readyCount = this._slotReady.filter((r, i) => r && this._slotConnected[i]).length;
            const connCount  = this._slotConnected.filter(c => c).length;
            ctx.fillStyle = '#0c6';
            ctx.fillText('READY (' + readyCount + '/' + connCount + ') ' +
                (this._mySlot === 0 ? '| Enter: START' : '| Waiting for host...') +
                '  |  Backspace: Unready  |  Esc: Disconnect', S.W / 2, S.H - 12);
        } else if (this._gameMode === 'draft') {
            const dq = this._slotCharQueues[this._mySlot];
            ctx.fillText('Enter: Pick character (' + dq.length + '/' + DRAFT_QUEUE_SIZE + ')  |  Backspace: Undo pick  |  Esc: Disconnect', S.W / 2, S.H - 12);
        } else {
            const tabHint = this._gameMode === 'team' ? '  |  Tab: Teams' : '';
            ctx.fillText('Enter: Select/Ready' + tabHint + '  |  Esc: Disconnect', S.W / 2, S.H - 12);
        }
    }

    _renderPlayerPanel(ctx, slot, x, y, w) {
        const isMe   = slot === this._mySlot;
        const conn   = this._slotConnected[slot];
        const charKey = this._slotChars[slot];
        const ready  = this._slotReady[slot];
        const name   = this._slotNames[slot] || (conn ? ('P' + (slot + 1)) : '');
        const team   = this._slotTeams[slot];
        const h = 95;

        // Background
        ctx.fillStyle = conn
            ? (isMe ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.03)')
            : 'rgba(255,255,255,0.015)';
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();

        if (isMe) {
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5; ctx.stroke();
        }

        if (!conn) {
            ctx.font = '14px Arial'; ctx.fillStyle = '#333'; ctx.textAlign = 'center';
            ctx.fillText('Empty', x + w / 2, y + h / 2);
            return;
        }

        ctx.textAlign = 'left';

        // Name + slot label
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = isMe ? '#ffd700' : '#ccc';
        ctx.fillText('P' + (slot + 1) + ' - ' + name, x + 8, y + 16);

        // Character / Draft queue
        if (this._gameMode === 'draft') {
            const queue = this._slotCharQueues[slot];
            ctx.textAlign = 'left';
            for (let q = 0; q < DRAFT_QUEUE_SIZE; q++) {
                if (q < queue.length) {
                    const rd = SMASH.ROSTER[queue[q]];
                    ctx.font = 'bold 10px Arial';
                    ctx.fillStyle = rd ? (rd.color || '#fff') : '#fff';
                    ctx.fillText((q + 1) + '. ' + (rd ? rd.name : '?'), x + 8, y + 34 + q * 13);
                } else {
                    ctx.font = '10px Arial'; ctx.fillStyle = '#333';
                    ctx.fillText((q + 1) + '. \u2014\u2014\u2014', x + 8, y + 34 + q * 13);
                }
            }
        } else if (charKey) {
            const rd = SMASH.ROSTER[charKey];
            ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left';
            ctx.fillStyle = rd.color || '#fff';
            ctx.fillText(rd.name, x + 8, y + 42);
        } else {
            ctx.font = '14px Arial'; ctx.fillStyle = '#555'; ctx.textAlign = 'left';
            ctx.fillText('No character', x + 8, y + 42);
        }

        // Team
        if (this._gameMode === 'team' && team >= 0) {
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = TEAM_COLORS[team];
            ctx.fillText('Team ' + TEAM_NAMES[team], x + 8, y + 62);
        }

        // Ready
        ctx.textAlign = 'right';
        if (ready) {
            ctx.font = 'bold 12px Arial'; ctx.fillStyle = '#0c6';
            ctx.fillText('READY', x + w - 8, y + 16);
        }

        // Host badge
        if (slot === 0) {
            ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#fa0';
            ctx.fillText('HOST', x + w - 8, y + h - 10);
        }
    }

    _renderModeStageSidebar(ctx, x, y) {
        const w = 155;
        const isHost = this._mySlot === 0;
        const selMode  = this._lobbySection === 'mode';
        const selStage = this._lobbySection === 'stage';

        // Mode section
        ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#aaa'; ctx.textAlign = 'left';
        ctx.fillText('GAME MODE', x + 5, y + 12);

        for (let i = 0; i < GAME_MODES.length; i++) {
            const my = y + 28 + i * 22;
            const active = GAME_MODES[i] === this._gameMode;
            const cursor = selMode && i === this._modeCursor;

            if (cursor) {
                ctx.fillStyle = 'rgba(255,215,0,0.15)';
                ctx.beginPath(); ctx.roundRect(x, my - 9, w, 20, 3); ctx.fill();
            }

            ctx.font = active ? 'bold 12px Arial' : '12px Arial';
            ctx.fillStyle = active ? '#ffd700' : (cursor ? '#fff' : '#666');
            ctx.textAlign = 'left';
            ctx.fillText((active ? '> ' : '  ') + MODE_LABELS[GAME_MODES[i]], x + 5, my + 1);
        }

        // Stage section
        const stageY = y + 28 + GAME_MODES.length * 22 + 15;
        ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#aaa';
        ctx.fillText('STAGE', x + 5, stageY);

        for (let i = 0; i < STAGES.length; i++) {
            const my = stageY + 16 + i * 22;
            const active = STAGES[i] === this._stageKey;
            const cursor = selStage && i === this._stageCursor;

            if (cursor) {
                ctx.fillStyle = 'rgba(255,215,0,0.15)';
                ctx.beginPath(); ctx.roundRect(x, my - 9, w, 20, 3); ctx.fill();
            }

            ctx.font = active ? 'bold 12px Arial' : '12px Arial';
            ctx.fillStyle = active ? '#0c6' : (cursor ? '#fff' : '#666');
            ctx.textAlign = 'left';
            ctx.fillText((active ? '> ' : '  ') + STAGE_LABELS[STAGES[i]], x + 5, my + 1);
        }

        ctx.font = '10px Arial'; ctx.fillStyle = '#555'; ctx.textAlign = 'left';
        ctx.fillText('(Set in game setup)', x + 5, stageY + 16 + STAGES.length * 22 + 10);
    }

    _renderTeamSidebar(ctx, x, y) {
        const w = 155;
        const selTeam = this._lobbySection === 'team';
        const myTeam  = this._slotTeams[this._mySlot];

        ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#aaa'; ctx.textAlign = 'left';
        ctx.fillText('YOUR TEAM', x + 5, y + 12);

        for (let t = 0; t < 4; t++) {
            const my = y + 30 + t * 28;
            const active = myTeam === t;
            const cursor = selTeam && t === this._teamCursor;

            if (cursor) {
                ctx.fillStyle = 'rgba(255,215,0,0.1)';
                ctx.beginPath(); ctx.roundRect(x, my - 10, w, 24, 3); ctx.fill();
            }

            ctx.font = active ? 'bold 13px Arial' : '13px Arial';
            ctx.fillStyle = active ? TEAM_COLORS[t] : (cursor ? '#ccc' : '#555');
            ctx.textAlign = 'left';

            // Count members
            const count = this._slotTeams.filter((tm, i) => tm === t && this._slotConnected[i]).length;
            ctx.fillText((active ? '> ' : '  ') + TEAM_NAMES[t] + ' (' + count + ')', x + 5, my + 2);
        }
    }

    _renderCharGrid(ctx, gridTop) {
        const keys = this._allKeys;
        const cols = 8;
        const sidebarW = 165;
        const rightSideW = this._gameMode === 'team' ? 165 : 0;
        const availW = S.W - sidebarW - rightSideW - 20;
        const cellW = Math.min(130, availW / cols);
        const cellH = 65;
        const gridW = cols * cellW;
        const startX = sidebarW + 10 + (availW - gridW) / 2;
        const startY = gridTop + 5;
        const selChar = this._lobbySection === 'char';

        for (let i = 0; i < keys.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx  = startX + col * cellW + cellW / 2;
            const cy  = startY + row * cellH + cellH / 2;
            const key = keys[i];
            const rd  = SMASH.ROSTER[key];

            const isCursor = selChar && i === this._cursor;
            const pickedBy = [];
            for (let s = 0; s < MAX_PLAYERS; s++) {
                if (this._slotChars[s] === key && this._slotConnected[s]) pickedBy.push(s);
            }

            let bgColor = 'rgba(255,255,255,0.04)';
            if (isCursor) bgColor = 'rgba(255,215,0,0.2)';
            if (pickedBy.includes(this._mySlot)) bgColor = 'rgba(0,200,100,0.2)';

            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.roundRect(cx - cellW / 2 + 2, cy - cellH / 2 + 2, cellW - 4, cellH - 4, 5);
            ctx.fill();

            if (isCursor) {
                ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke();
            } else if (pickedBy.includes(this._mySlot)) {
                ctx.strokeStyle = '#0c6'; ctx.lineWidth = 1.5; ctx.stroke();
            }

            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = rd.color || '#ccc';
            ctx.textAlign = 'center';
            ctx.fillText(rd.name, cx, cy - 6);

            ctx.font = '9px Arial'; ctx.fillStyle = '#555';
            ctx.fillText(key, cx, cy + 8);

            // Show who picked this
            if (pickedBy.length > 0) {
                ctx.font = 'bold 9px Arial';
                const labels = pickedBy.map(s => 'P' + (s + 1));
                ctx.fillStyle = pickedBy.includes(this._mySlot) ? '#0c6' : '#f88';
                ctx.fillText(labels.join(' '), cx, cy + 22);
            }
        }
    }

    // ── Result ───────────────────────────────────────────────────
    _renderResult(ctx) {
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        ctx.font = 'bold 48px Arial'; ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 20;
        ctx.fillText('MATCH OVER', S.W / 2, 80);
        ctx.shadowBlur = 0;

        if (this._resultWinner != null && this._resultWinner >= 0) {
            const winSlot = this._resultWinner;
            const winChar = this._resultChars[winSlot];
            const rd = winChar ? SMASH.ROSTER[winChar] : null;

            ctx.font = 'bold 40px Arial';
            ctx.fillStyle = rd ? (rd.color || '#fff') : '#fff';
            ctx.fillText(rd ? rd.name : 'Unknown', S.W / 2, 170);

            ctx.font = 'bold 28px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.fillText('P' + (winSlot + 1) + ' WINS!', S.W / 2, 220);

            if (winSlot === this._mySlot) {
                ctx.font = 'bold 24px Arial'; ctx.fillStyle = '#0f0';
                ctx.fillText('YOU WIN!', S.W / 2, 270);
            } else {
                ctx.font = 'bold 24px Arial'; ctx.fillStyle = '#f44';
                ctx.fillText('YOU LOSE', S.W / 2, 270);
            }
        }

        // Rematch
        ctx.font = '20px Arial'; ctx.fillStyle = '#aaa';
        const myR = this._rematchRequested[this._mySlot];
        const allR = this._readySlots.length >= 2 && this._readySlots.every(s => this._rematchRequested[s]);

        if (allR) {
            ctx.fillStyle = '#0c6';
            ctx.fillText('Everyone wants a rematch! Press Enter.', S.W / 2, 350);
        } else if (myR) {
            ctx.fillText('Rematch requested - waiting for others...', S.W / 2, 350);
        } else {
            ctx.fillText('Enter: Rematch   Esc: Leave', S.W / 2, 350);
        }

        ctx.font = '14px Arial'; ctx.fillStyle = '#555';
        ctx.fillText('Esc: Disconnect and return to menu', S.W / 2, S.H - 20);
    }
}

SMASH.MultiplayerScene = MultiplayerScene;
})();
