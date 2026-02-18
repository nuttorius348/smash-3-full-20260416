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
 *    • aiDifficulty (1-9)
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
        this.aiDifficulty = Math.max(1, Math.min(10, this.aiDifficulty + delta));
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

    getConfig(deviceList) {
        if (this.controllerType === 'ai') {
            return {
                port: this.port,
                character: this.characterKey,
                type: 'ai',
                level: this.aiDifficulty,
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
    constructor(canvas, deviceMgr) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.deviceMgr = deviceMgr || new SMASH.DeviceManager();

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

        // Clear mouse click at end of frame
        this._mouseClicked = false;
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
        const slotW = 280;
        const gap = 20;
        const totalW = 4 * slotW + 3 * gap;
        const startX = (S.W - totalW) / 2;
        const x = startX + slotIdx * (slotW + gap);
        return { x: x + 10, y: 400 + 150, w: slotW - 20, h: 24 };
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

        // Enter/Space: toggle ready
        if (this._justPressed('Enter') || this._justPressed('Space')) {
            slot.toggleReady();
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
        const active = this.slots.filter(s => s.active);
        if (active.length < 2) {
            this.startHovered = false;
            return;
        }
        const allReady = active.every(s => s.ready);
        if (allReady && this._justPressed('Enter')) {
            this._startMatch();
        }
    }

    _startMatch() {
        const configs = this.slots
            .filter(s => s.active)
            .map(s => s.getConfig(this._availableDevices));

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
        const w = 170;
        const h = 150;
        const gap = 18;
        const charsPerRow = 4;
        const rowGap = 15;
        const startY = 110;

        for (let i = 0; i < this.characters.length; i++) {
            const ch = this.characters[i];
            
            // Grid layout: 4 characters per row
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
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(ch.name.toUpperCase(), x + w / 2, y + h - 10);

            // Character sprite/portrait
            const portraitX = x + 10;
            const portraitY = y + 15;
            const portraitW = w - 20;
            const portraitH = h - 50;
            
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
        const y = 450;
        const w = 280;
        const h = 180;
        const gap = 20;
        const totalW = 4 * w + 3 * gap;
        const startX = (S.W - totalW) / 2;

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
            const ctrlText = slot.controllerType === 'ai' 
                ? (slot.aiDifficulty >= 10 ? 'AI ELITE ★' : `AI Level ${slot.aiDifficulty}`)
                : 'HUMAN';
            ctx.fillText(ctrlText, x + w / 2, y + 90);

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
                ctx.fillText('Press ENTER', x + w / 2, y + 130);
            }

            // Controls hint
            ctx.fillStyle = '#888';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('←→: Char  ↑↓: Type  R/F: Device', x + w / 2, y + h - 30);
            ctx.fillText('Q/E: AI  ESC: Cancel', x + w / 2, y + h - 15);
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
        ctx.fillText('R/F: Cycle Input Device  •  Q/E: AI Level  •  Click 🎮 to assign device', S.W / 2, 642);
        ctx.restore();
    }

    _renderStartButton(ctx) {
        const active = this.slots.filter(s => s.active);
        const canStart = active.length >= 2 && active.every(s => s.ready);

        const x = S.W / 2 - 100;
        const y = 660;
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
}

// ══════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════

SMASH.CharacterSelectScene = CharacterSelectScene;
SMASH.PlayerSlot = PlayerSlot;

})();
