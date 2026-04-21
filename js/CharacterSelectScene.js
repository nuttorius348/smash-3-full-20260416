/**
 * CharacterSelectScene.js — Interactive character select screen.
 *
 * ══════════════════════════════════════════════════════════════════
 *  ARCHITECTURE
 * ══════════════════════════════════════════════════════════════════
 *  CharacterSelectScene — main orchestrator
 *    • 4 PlayerSlot instances (P1-P4)
 *    • Character portrait display row
 *    • Controller assignment via DeviceManager
 *    • Ready state tracking
 *    • Start button enables when all active slots ready
 *
 *  PlayerSlot — per-player state
 *    • port (0-3)
 *    • active (in/out)
 *    • characterKey (selected character)
 *    • controllerType ('human', 'ai')
 *    • aiDifficulty (1-13)
 *    • deviceId (assigned controller)
 *    • ready (boolean)
 *
 *  UI Controls:
 *    • Left/Right — cycle character
 *    • A/Enter   — toggle ready / confirm
 *    • B/Esc     — back / unready
 *    • Up/Down   — change controller type
 *    • L/R       — adjust AI difficulty
 *
 * ══════════════════════════════════════════════════════════════════
 */
(function() {
const S = SMASH.Settings;

// ══════════════════════════════════════════════════════════════════
//  PlayerSlot
// ══════════════════════════════════════════════════════════════════

class PlayerSlot {
    constructor(port) {
        this.port = port;
        this.active = false;
        this.characterKey = 'brawler';
        this.controllerType = 'human';  // 'human' | 'ai'
        this.aiDifficulty = 5;
        this.deviceId = null;
        this.ready = false;
        this.team = port % 2;  // 0=A, 1=B, 2=C, 3=D  (default: alternating A/B)

        // Device assignment
        this.selectedDeviceIdx = port;  // default: port 0→wasd, 1→arrows, 2→ijkl, 3→wasd

        // Input state for cycling actions
        this._inputCooldown = 0;
    }

    activate() {
        this.active = true;
        this.ready = false;
    }

    deactivate() {
        this.active = false;
        this.ready = false;
    }

    cycleCharacter(dir) {
        if (this.ready) return;
        const keys = SMASH.getCharacterKeys();
        const idx = keys.indexOf(this.characterKey);
        let next = idx + dir;
        if (next < 0) next = keys.length - 1;
        if (next >= keys.length) next = 0;
        this.characterKey = keys[next];
    }

    cycleControllerType(dir) {
        if (this.ready) return;
        const types = ['human', 'ai'];
        const idx = types.indexOf(this.controllerType);
        let next = idx + dir;
        if (next < 0) next = types.length - 1;
        if (next >= types.length) next = 0;
        this.controllerType = types[next];
    }

    adjustAIDifficulty(delta) {
        if (this.ready || this.controllerType !== 'ai') return;
        // 1-10 = classic scripted AI, 11 = Ollama AI, 12 = adaptive scripted AI, 13 = learned Q-AI.
        this.aiDifficulty = Math.max(1, Math.min(13, this.aiDifficulty + delta));
    }

    cycleTeam(dir) {
        if (this.ready) return;
        this.team = ((this.team + dir) % 4 + 4) % 4;  // 0-3 wrap
    }

    toggleReady() {
        if (!this.active) return false;
        this.ready = !this.ready;
        return this.ready;
    }

    cycleDevice(deviceList, dir) {
        if (this.ready || this.controllerType !== 'human') return;
        if (!deviceList || deviceList.length === 0) return;
        const d = dir || 1;
        this.selectedDeviceIdx = ((this.selectedDeviceIdx || 0) + d + deviceList.length) % deviceList.length;
    }

    getSelectedDeviceName(deviceList) {
        if (!deviceList || deviceList.length === 0) return 'Keyboard (WASD)';
        const idx = (this.selectedDeviceIdx || 0) % deviceList.length;
        return deviceList[idx] ? deviceList[idx].name : 'Keyboard (WASD)';
    }

    getConfig(deviceList, gameMode) {
        if (this.controllerType === 'ai') {
            const useOllama = this.aiDifficulty === 11;
            const useLearnedQ = this.aiDifficulty >= 13;
            return {
                port: this.port,
                character: this.characterKey,
                type: useLearnedQ ? 'learned_ai' : (useOllama ? 'ollama_ai' : 'ai'),
                level: useOllama ? 10 : Math.min(12, this.aiDifficulty),
                team: gameMode === 'team' ? this.team : -1,
            };
        } else {
            // Human player — use selected device
            const devices = deviceList || [];
            const idx = (this.selectedDeviceIdx || 0) % (devices.length || 1);
            const device = devices[idx];

            if (device && device.type === 'gamepad') {
                return {
                    port: this.port,
                    character: this.characterKey,
                    team: gameMode === 'team' ? this.team : -1,
                    deviceConfig: {
                        type: device.controllerType || SMASH.CONTROLLER_TYPES.XBOX,
                        index: device.index,
                    },
                };
            } else {
                // Keyboard layout
                const layout = device ? device.layout : 'wasd';
                return {
                    port: this.port,
                    character: this.characterKey,
                    team: gameMode === 'team' ? this.team : -1,
                    deviceConfig: {
                        type: SMASH.CONTROLLER_TYPES.KEYBOARD,
                        layout: layout,
                    },
                };
            }
        }
    }

    _buildDeviceConfig() {
        // Deprecated - logic moved to getConfig()
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════
//  CharacterSelectScene
// ══════════════════════════════════════════════════════════════════

class CharacterSelectScene {
    constructor(canvas, deviceMgr, options) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.deviceMgr = deviceMgr || new SMASH.DeviceManager();
        this._gameMode = (options && options.gameMode) || 'stock';

        // Player slots
        this.slots = [
            new PlayerSlot(0),
            new PlayerSlot(1),
            new PlayerSlot(2),
            new PlayerSlot(3),
        ];

        // At least P1 active by default
        this.slots[0].activate();

        // UI state
        this.focusedSlot = 0;  // which slot has focus
        this.startHovered = false;

        // Controller scan state
        this._scanResults = [];
        this._scanFlash = 0;   // flash timer for scan button feedback

        // Available device list for assignment
        this._availableDevices = ['wasd', 'arrows', 'ijkl']; // default keyboard layouts

        // Character portraits metadata
        this.characters = this._loadCharacterData();

        // Input tracking
        this._keys = new Set();
        this._lastKeys = new Set();
        this._mouseX = 0;
        this._mouseY = 0;
        this._mouseClicked = false;
        this._setupInput();

        // Animation
        this._lastTime = 0;
        this._running = false;
        this._raf = null;
        this._wasGameReady = false;

        // Callback when match starts
        this.onStartMatch = null;
    }

    _loadCharacterData() {
        const keys = SMASH.getCharacterKeys();
        return keys.map(key => {
            const rosterData = SMASH.ROSTER[key];
            const fighterData = new SMASH.FighterData(key);  // Load FighterData for sprite
            return {
                key,
                name: rosterData.name || key,
                color: rosterData.color || '#888',
                description: rosterData.description || '',
                sprite: rosterData.idleSprite || 'sprites/placeholder.png',
                data: fighterData,  // Include FighterData for sprite access
            };
        });
    }

    _setupInput() {
        window.addEventListener('keydown', e => {
            this._keys.add(e.code);
        });
        window.addEventListener('keyup', e => {
            this._keys.delete(e.code);
        });
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this._mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            this._mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        });
        this.canvas.addEventListener('click', e => {
            const rect = this.canvas.getBoundingClientRect();
            this._mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            this._mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
            this._mouseClicked = true;
        });
    }

    _justPressed(code) {
        return this._keys.has(code) && !this._lastKeys.has(code);
    }

    start() {
        this._running = true;
        this._lastTime = performance.now();
        this._loop(this._lastTime);
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    _loop(time) {
        if (!this._running) return;
        this._raf = requestAnimationFrame(t => this._loop(t));

        const dt = Math.min((time - this._lastTime) / 1000, 0.1);
        this._lastTime = time;

        this._update(dt);
        this._render();

        // Frame cleanup
        this._lastKeys = new Set(this._keys);
    }

    _update(dt) {
        // Scan for controllers
        this.deviceMgr.scan();

        // Update scan flash timer
        if (this._scanFlash > 0) this._scanFlash -= dt;

        // Build available devices list
        this._rebuildDeviceList();

        // Update slot input cooldowns
        for (const slot of this.slots) {
            if (slot._inputCooldown > 0) slot._inputCooldown -= dt;
        }

        // Process mouse clicks on UI buttons
        this._handleMouseClicks();

        // Process input for focused slot
        this._handleInput();

        // Check if can start
        this._checkStartCondition();

        // Trigger SFX on transition into game-ready state
        this._updateGameReadySFXState();

        // Clear mouse click at end of frame
        this._mouseClicked = false;
    }

    _updateGameReadySFXState() {
        const isReadyNow = this._hasEnoughReadyPlayers();
        if (isReadyNow && !this._wasGameReady && SMASH.SFX) {
            SMASH.SFX.playGameReady();
        }
        this._wasGameReady = isReadyNow;
    }

    _rebuildDeviceList() {
        const devices = this.deviceMgr.getDevices();
        this._availableDevices = [];

        // Always include keyboard layouts
        this._availableDevices.push({ id: 'kbd-wasd', name: 'Keyboard (WASD)', type: 'keyboard', layout: 'wasd' });
        this._availableDevices.push({ id: 'kbd-arrows', name: 'Keyboard (Arrows)', type: 'keyboard', layout: 'arrows' });
        this._availableDevices.push({ id: 'kbd-ijkl', name: 'Keyboard (IJKL)', type: 'keyboard', layout: 'ijkl' });

        // Add detected gamepads
        for (const d of devices) {
            if (d.type !== SMASH.CONTROLLER_TYPES.KEYBOARD) {
                this._availableDevices.push({
                    id: d.id,
                    name: d.name,
                    type: 'gamepad',
                    index: d.index,
                    controllerType: d.type,
                });
            }
        }

        this._scanResults = devices.filter(d => d.type !== SMASH.CONTROLLER_TYPES.KEYBOARD);
    }

    _handleMouseClicks() {
        if (!this._mouseClicked) return;

        const mx = this._mouseX;
        const my = this._mouseY;

        // Check scan button click
        const scanBtn = this._getScanButtonRect();
        if (mx >= scanBtn.x && mx <= scanBtn.x + scanBtn.w &&
            my >= scanBtn.y && my <= scanBtn.y + scanBtn.h) {
            this._doControllerScan();
            return;
        }

        // Check device assignment button clicks on each slot
        for (let i = 0; i < 4; i++) {
            const slot = this.slots[i];
            if (!slot.active || slot.controllerType !== 'human') continue;
            const btn = this._getDeviceButtonRect(i);
            if (mx >= btn.x && mx <= btn.x + btn.w &&
                my >= btn.y && my <= btn.y + btn.h) {
                if (!slot.ready) {
                    slot.cycleDevice(this._availableDevices);
                }
            }
        }
    }

    _doControllerScan() {
        this.deviceMgr._lastScan = 0; // force rescan
        this.deviceMgr.scan();
        this._rebuildDeviceList();
        this._scanFlash = 1.5; // flash for 1.5 seconds
    }

    _getScanButtonRect() {
        return { x: S.W - 220, y: 10, w: 200, h: 36 };
    }

    _getDeviceButtonRect(slotIdx) {
        const layout = this._getSlotLayout();
        const x = layout.startX + slotIdx * (layout.w + layout.gap);
        return { x: x + 10, y: layout.y + 150, w: layout.w - 20, h: 24 };
    }

    _getSlotLayout() {
        const w = 260;
        const h = 170;
        const gap = 16;
        const totalW = 4 * w + 3 * gap;
        const startX = (S.W - totalW) / 2;
        const y = 380;
        return { w, h, gap, totalW, startX, y };
    }

    _handleInput() {
        const slot = this.slots[this.focusedSlot];
        if (!slot || !slot.active) return;
        if (slot._inputCooldown > 0) return;

        const cooldown = 0.15;

        // Left/Right: cycle character
        if (this._justPressed('ArrowLeft') || this._justPressed('KeyA')) {
            slot.cycleCharacter(-1);
            slot._inputCooldown = cooldown;
        }
        if (this._justPressed('ArrowRight') || this._justPressed('KeyD')) {
            slot.cycleCharacter(1);
            slot._inputCooldown = cooldown;
        }

        // Up/Down: cycle controller type
        if (this._justPressed('ArrowUp') || this._justPressed('KeyW')) {
            slot.cycleControllerType(-1);
            slot._inputCooldown = cooldown;
        }
        if (this._justPressed('ArrowDown') || this._justPressed('KeyS')) {
            slot.cycleControllerType(1);
            slot._inputCooldown = cooldown;
        }

        // Q/E: AI difficulty
        if (this._justPressed('KeyQ')) {
            slot.adjustAIDifficulty(-1);
            slot._inputCooldown = cooldown;
        }
        if (this._justPressed('KeyE')) {
            slot.adjustAIDifficulty(1);
            slot._inputCooldown = cooldown;
        }

        // Space: toggle ready
        if (this._justPressed('Space')) {
            const lockedIn = slot.toggleReady();
            if (lockedIn && SMASH.SFX) {
                SMASH.SFX.playCharacterSelect(slot.characterKey);
                SMASH.SFX.playSelectAny();
            }
            slot._inputCooldown = cooldown;
        }

        // Escape: unready
        if (this._justPressed('Escape')) {
            slot.ready = false;
            slot._inputCooldown = cooldown;
        }

        // Tab: switch focus to next active slot
        if (this._justPressed('Tab')) {
            this._cycleFocus(1);
            slot._inputCooldown = cooldown;
        }

        // Number keys: activate/focus slot
        for (let i = 0; i < 4; i++) {
            if (this._justPressed(`Digit${i + 1}`)) {
                if (!this.slots[i].active) this.slots[i].activate();
                this.focusedSlot = i;
                slot._inputCooldown = cooldown;
            }
        }

        // R/F: cycle input device for human slots
        if (this._justPressed('KeyR')) {
            if (slot.controllerType === 'human' && !slot.ready) {
                slot.cycleDevice(this._availableDevices);
            }
            slot._inputCooldown = cooldown;
        }
        if (this._justPressed('KeyF')) {
            if (slot.controllerType === 'human' && !slot.ready) {
                slot.cycleDevice(this._availableDevices, -1);
            }
            slot._inputCooldown = cooldown;
        }

        // T/G: cycle team (only in team mode)
        if (this._gameMode === 'team') {
            if (this._justPressed('KeyT')) {
                slot.cycleTeam(1);
                slot._inputCooldown = cooldown;
            }
            if (this._justPressed('KeyG')) {
                slot.cycleTeam(-1);
                slot._inputCooldown = cooldown;
            }
        }

        // Backspace: deactivate focused slot (except P1)
        if (this._justPressed('Backspace') && this.focusedSlot > 0) {
            this.slots[this.focusedSlot].deactivate();
            this._cycleFocus(-1);
            slot._inputCooldown = cooldown;
        }
    }

    _cycleFocus(dir) {
        for (let i = 1; i <= 4; i++) {
            const idx = (this.focusedSlot + i * dir + 4) % 4;
            if (this.slots[idx].active) {
                this.focusedSlot = idx;
                return;
            }
        }
    }

    _checkStartCondition() {
        if (!this._canStartMatch()) {
            this.startHovered = false;
            return;
        }
        if (this._justPressed('Enter')) {
            this._startMatch();
        }
    }

    _canStartMatch() {
        const active = this.slots.filter(s => s.active);
        const minPlayers = this._gameMode === 'wave' ? 1 : 2;
        return active.length >= minPlayers && active.every(s => s.ready);
    }

    _hasEnoughReadyPlayers() {
        const readyCount = this.slots.filter(s => s.active && s.ready).length;
        const minReady = this._gameMode === 'wave' ? 1 : 2;
        return readyCount >= minReady;
    }

    _startMatch() {
        const configs = this.slots
            .filter(s => s.active)
            .map(s => s.getConfig(this._availableDevices, this._gameMode));

        if (this.onStartMatch) {
            this.onStartMatch(configs);
        }
    }

    // ── Render ───────────────────────────────────────────────────
    _render() {
        const ctx = this.ctx;

        // Background
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, S.W, S.H);

        // Gradient overlay
        const grad = ctx.createLinearGradient(0, 0, 0, S.H);
        grad.addColorStop(0, 'rgba(20,20,40,0.5)');
        grad.addColorStop(1, 'rgba(10,10,20,0.8)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, S.W, S.H);

        // Title
        this._renderTitle(ctx);

        // Scan Controllers button
        this._renderScanButton(ctx);

        // Character portraits
        this._renderCharacterPortraits(ctx);

        // Player slots
        this._renderPlayerSlots(ctx);

        // Instructions
        this._renderInstructions(ctx);

        // Start button
        this._renderStartButton(ctx);

        // Flashy confirmation overlay when lobby is fully ready
        this._renderGameReadyOverlay(ctx);
    }

    _renderTitle(ctx) {
        ctx.save();
        ctx.font = 'bold 56px Arial';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';
        ctx.strokeText('CHARACTER SELECT', S.W / 2, 70);
        ctx.fillText('CHARACTER SELECT', S.W / 2, 70);
        ctx.restore();
    }

    _renderScanButton(ctx) {
        const btn = this._getScanButtonRect();
        const hovering = this._mouseX >= btn.x && this._mouseX <= btn.x + btn.w &&
                         this._mouseY >= btn.y && this._mouseY <= btn.y + btn.h;
        const flashing = this._scanFlash > 0;

        // Button background
        ctx.fillStyle = flashing ? '#2a6' : (hovering ? '#345' : '#223');
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.strokeStyle = flashing ? '#4f8' : (hovering ? '#68a' : '#445');
        ctx.lineWidth = 2;
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

        // Button text
        ctx.fillStyle = flashing ? '#fff' : (hovering ? '#cdf' : '#8ab');
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎮 SCAN CONTROLLERS', btn.x + btn.w / 2, btn.y + 24);

        // Show found controllers count
        const gpCount = this._scanResults.length;
        if (gpCount > 0 || flashing) {
            ctx.fillStyle = '#4f8';
            ctx.font = '12px Arial';
            ctx.fillText(
                gpCount > 0 ? `${gpCount} controller${gpCount > 1 ? 's' : ''} found` : 'Scanning...',
                btn.x + btn.w / 2, btn.y + btn.h + 15
            );

            // List controller names
            if (gpCount > 0) {
                ctx.fillStyle = '#8bc';
                ctx.font = '11px Arial';
                for (let i = 0; i < Math.min(gpCount, 3); i++) {
                    ctx.fillText(
                        this._scanResults[i].name,
                        btn.x + btn.w / 2, btn.y + btn.h + 28 + i * 13
                    );
                }
            }
        } else {
            ctx.fillStyle = '#666';
            ctx.font = '11px Arial';
            ctx.fillText('No controllers detected', btn.x + btn.w / 2, btn.y + btn.h + 15);
        }
    }

    _renderCharacterPortraits(ctx) {
        const gap = 8;
        const rowGap = 8;
        const startY = 95;
        const slotTop = this._getSlotLayout().y;
        const maxPortraitAreaH = Math.max(120, slotTop - startY - 16);

        let charsPerRow = Math.min(this.characters.length, 9);
        let rows = Math.ceil(this.characters.length / charsPerRow);
        while (charsPerRow < this.characters.length && rows > 2) {
            charsPerRow++;
            rows = Math.ceil(this.characters.length / charsPerRow);
        }

        const w = Math.max(84, Math.min(112,
            Math.floor((S.W - 120 - (charsPerRow - 1) * gap) / charsPerRow)
        ));
        const h = Math.max(72, Math.min(108,
            Math.floor((maxPortraitAreaH - (rows - 1) * rowGap) / rows)
        ));

        for (let i = 0; i < this.characters.length; i++) {
            const ch = this.characters[i];
            
            // Adaptive grid layout keeps all cards above player slots.
            const row = Math.floor(i / charsPerRow);
            const col = i % charsPerRow;
            const charsInRow = Math.min(charsPerRow, this.characters.length - row * charsPerRow);
            const rowW = charsInRow * w + (charsInRow - 1) * gap;
            const x = (S.W - rowW) / 2 + col * (w + gap);
            const y = startY + row * (h + rowGap);

            // Check if any slot has this character selected
            const selectedBy = this.slots.filter(s => s.active && s.characterKey === ch.key);

            // Card background
            ctx.fillStyle = selectedBy.length > 0 ? 'rgba(80,80,120,0.6)' : 'rgba(40,40,60,0.4)';
            ctx.fillRect(x, y, w, h);

            // Border (show which slots selected this)
            if (selectedBy.length > 0) {
                ctx.strokeStyle = S.P_COLORS[selectedBy[0].port];
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, w, h);
            } else {
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
            }

            // Character name
            ctx.fillStyle = ch.color || '#fff';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(ch.name.toUpperCase(), x + w / 2, y + h - 8);

            // Character sprite/portrait
            const portraitX = x + 6;
            const portraitY = y + 8;
            const portraitW = w - 12;
            const portraitH = h - 34;
            
            if (ch.data && ch.data.spriteLoaded && ch.data.spriteImage) {
                // Draw actual character sprite
                ctx.drawImage(ch.data.spriteImage, portraitX, portraitY, portraitW, portraitH);
            } else {
                // Fallback placeholder
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(portraitX, portraitY, portraitW, portraitH);
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.fillText('LOADING...', x + w / 2, y + h / 2);
            }

            // Selected indicator badges
            if (selectedBy.length > 0) {
                for (let j = 0; j < selectedBy.length; j++) {
                    const p = selectedBy[j].port;
                    ctx.fillStyle = S.P_COLORS[p];
                    ctx.fillRect(x + 10 + j * 25, y + 10, 20, 20);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px Arial';
                    ctx.fillText(`P${p + 1}`, x + 20 + j * 25, y + 23);
                }
            }
        }
    }

    _renderPlayerSlots(ctx) {
        const layout = this._getSlotLayout();
        const y = layout.y;
        const w = layout.w;
        const h = layout.h;
        const gap = layout.gap;
        const startX = layout.startX;

        for (let i = 0; i < 4; i++) {
            const slot = this.slots[i];
            const x = startX + i * (w + gap);
            const focused = this.focusedSlot === i;

            // Slot background
            if (slot.active) {
                ctx.fillStyle = focused ? 'rgba(60,60,100,0.5)' : 'rgba(40,40,70,0.4)';
            } else {
                ctx.fillStyle = 'rgba(20,20,30,0.3)';
            }
            ctx.fillRect(x, y, w, h);

            // Border
            ctx.strokeStyle = slot.active ? S.P_COLORS[i] : '#333';
            ctx.lineWidth = focused ? 4 : 2;
            ctx.strokeRect(x, y, w, h);

            // Port label
            ctx.fillStyle = S.P_COLORS[i];
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`P${i + 1}`, x + 10, y + 30);

            if (!slot.active) {
                // Inactive slot
                ctx.fillStyle = '#666';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Press ' + (i + 1) + ' to join', x + w / 2, y + h / 2);
                continue;
            }

            // Character name
            const ch = this.characters.find(c => c.key === slot.characterKey);
            ctx.fillStyle = slot.ready ? '#4f4' : '#fff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(ch.name.toUpperCase(), x + w / 2, y + 60);

            // Controller type
            ctx.fillStyle = '#ccc';
            ctx.font = '16px Arial';
            let ctrlText = 'HUMAN';
            if (slot.controllerType === 'ai') {
                if (slot.aiDifficulty === 11) {
                    ctrlText = 'AI Difficulty: OLLAMA (LLAMA3)';
                } else if (slot.aiDifficulty >= 13) {
                    ctrlText = 'AI Difficulty: LEARNED Q-AI';
                } else if (slot.aiDifficulty >= 12) {
                    ctrlText = 'AI Difficulty: ADAPTIVE SCRIPTED';
                } else if (slot.aiDifficulty >= 10) {
                    ctrlText = 'AI ELITE ★';
                } else {
                    ctrlText = `AI Level ${slot.aiDifficulty}`;
                }
            }
            ctx.fillText(ctrlText, x + w / 2, y + 90);

            // Team badge (team mode only)
            if (this._gameMode === 'team') {
                const teamLetters = ['A', 'B', 'C', 'D'];
                const teamColors  = ['#ff4444', '#4488ff', '#44dd44', '#ddaa22'];
                const tl = teamLetters[slot.team] || 'A';
                const tc = teamColors[slot.team] || '#fff';
                ctx.fillStyle = tc;
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(`TEAM ${tl}`, x + w - 8, y + 30);
                ctx.textAlign = 'center';
            }

            // Device assignment (for human players)
            if (slot.controllerType === 'human') {
                const devName = slot.getSelectedDeviceName(this._availableDevices);
                const devBtn = this._getDeviceButtonRect(i);

                // Device button background
                const devHover = this._mouseX >= devBtn.x && this._mouseX <= devBtn.x + devBtn.w &&
                                 this._mouseY >= devBtn.y && this._mouseY <= devBtn.y + devBtn.h;
                ctx.fillStyle = devHover ? 'rgba(60,80,120,0.6)' : 'rgba(40,50,80,0.4)';
                ctx.fillRect(devBtn.x, devBtn.y, devBtn.w, devBtn.h);
                ctx.strokeStyle = devHover ? '#68a' : '#446';
                ctx.lineWidth = 1;
                ctx.strokeRect(devBtn.x, devBtn.y, devBtn.w, devBtn.h);

                // Device name
                ctx.fillStyle = '#adf';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`🎮 ${devName}`, devBtn.x + devBtn.w / 2, devBtn.y + 16);
            }

            // Ready state
            if (slot.ready) {
                ctx.fillStyle = '#4f4';
                ctx.font = 'bold 24px Arial';
                ctx.fillText('✓ READY', x + w / 2, y + 130);
            } else {
                ctx.fillStyle = '#fa4';
                ctx.font = '16px Arial';
                ctx.fillText('Press SPACE', x + w / 2, y + 130);
            }

            // Controls hint
            ctx.fillStyle = '#888';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            if (this._gameMode === 'team') {
                ctx.fillText('←→: Char  ↑↓: Type  T/G: Team', x + w / 2, y + h - 30);
                ctx.fillText('R/F: Device  Q/E: AI  ESC: Cancel', x + w / 2, y + h - 15);
            } else {
                ctx.fillText('←→: Char  ↑↓: Type  R/F: Device', x + w / 2, y + h - 30);
                ctx.fillText('Q/E: AI  ESC: Cancel', x + w / 2, y + h - 15);
            }
        }
    }

    _renderInstructions(ctx) {
        ctx.save();
        ctx.fillStyle = '#aaa';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TAB: Switch Focus  •  1-4: Join Slot  •  BACKSPACE: Leave Slot', S.W / 2, 625);
        ctx.fillStyle = '#8ab';
        ctx.font = '13px Arial';
        if (this._gameMode === 'team') {
            ctx.fillText('R/F: Device  •  Q/E: AI (11 = OLLAMA, 12 = ADAPTIVE, 13 = LEARNED)  •  T/G: Team', S.W / 2, 642);
        } else {
            ctx.fillText('R/F: Device  •  Q/E: AI Difficulty (11 = OLLAMA, 12 = ADAPTIVE, 13 = LEARNED)', S.W / 2, 642);
        }
        ctx.restore();
    }

    _renderStartButton(ctx) {
        const canStart = this._canStartMatch();

        const x = S.W / 2 - 100;
        const y = 560;
        const w = 200;
        const h = 50;

        // Button
        ctx.fillStyle = canStart ? '#4f4' : '#444';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = canStart ? '#6f6' : '#666';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        // Text
        ctx.fillStyle = canStart ? '#000' : '#666';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(canStart ? 'START MATCH!' : 'NOT READY', x + w / 2, y + 33);

        if (canStart) {
            ctx.fillStyle = '#6f6';
            ctx.font = '12px Arial';
            ctx.fillText('Press ENTER', x + w / 2, y + h + 18);
        }
    }

    _renderGameReadyOverlay(ctx) {
        if (!this._hasEnoughReadyPlayers()) return;

        const t = performance.now() / 1000;
        const pulse = 0.55 + 0.45 * Math.sin(t * 8.0);
        const glowA = 0.18 + 0.16 * pulse;

        ctx.save();

        // Full-screen tint flash
        ctx.fillStyle = `rgba(80, 255, 150, ${glowA.toFixed(3)})`;
        ctx.fillRect(0, 0, S.W, S.H);

        // Main banner
        const bannerW = 760;
        const bannerH = 120;
        const bx = (S.W - bannerW) / 2;
        const by = 220;

        const grad = ctx.createLinearGradient(bx, by, bx + bannerW, by);
        grad.addColorStop(0, `rgba(20, 80, 40, ${(0.75 + pulse * 0.2).toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(70, 220, 130, ${(0.8 + pulse * 0.2).toFixed(3)})`);
        grad.addColorStop(1, `rgba(20, 80, 40, ${(0.75 + pulse * 0.2).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(bx, by, bannerW, bannerH);

        ctx.strokeStyle = '#d8ffe8';
        ctx.lineWidth = 4 + pulse * 2;
        ctx.strokeRect(bx, by, bannerW, bannerH);

        // Text
        ctx.textAlign = 'center';
        ctx.font = 'bold 72px Arial';
        ctx.strokeStyle = 'rgba(0, 40, 15, 0.95)';
        ctx.lineWidth = 7;
        ctx.strokeText('GAME READY', S.W / 2, by + 82);
        ctx.fillStyle = '#f4fff8';
        ctx.fillText('GAME READY', S.W / 2, by + 82);

        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#eafff0';
        ctx.fillText('Press ENTER to start', S.W / 2, by + bannerH + 34);

        ctx.restore();
    }
}

// ══════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════

SMASH.CharacterSelectScene = CharacterSelectScene;
SMASH.PlayerSlot = PlayerSlot;

})();
