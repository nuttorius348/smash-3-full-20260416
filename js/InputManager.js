/**
 * InputManager.js — Unified controller abstraction with device detection.
 *
 * Supports:
 *  • Keyboard (WASD, Arrows, IJKL layouts + custom remapping)
 *  • Nintendo Switch Pro Controller
 *  • PS4 DualShock 4
 *  • PS5 DualSense
 *  • Xbox controllers (standard mapping fallback)
 *
 * ══════════════════════════════════════════════════════════════════
 *  CONTROLLER MAPPINGS
 * ══════════════════════════════════════════════════════════════════
 *
 *  Nintendo Switch Pro Controller:
 *    A (button 1)     → attack
 *    B (button 0)     → special
 *    X (button 3)     → jump
 *    Y (button 2)     → jump
 *    L/ZL (4/6)       → shield
 *    R/ZR (5/7)       → grab
 *    Left Stick       → movement
 *    D-Pad (12-15)    → movement
 *    + (button 9)     → pause
 *
 *  PS4 DualShock 4 / PS5 DualSense:
 *    Cross (button 0)     → attack
 *    Circle (button 1)    → special
 *    Square (button 2)    → jump
 *    Triangle (button 3)  → jump
 *    L1/L2 (4/6)          → shield
 *    R1/R2 (5/7)          → grab
 *    Left Stick           → movement
 *    D-Pad (12-15)        → movement
 *    Options (button 9)   → pause
 *
 *  Keyboard (default WASD layout):
 *    W/A/S/D          → movement
 *    , (comma)        → attack
 *    . (period)       → special
 *    Space            → jump
 *    Shift            → shield
 *    E                → grab
 *    Escape           → pause
 *
 * ══════════════════════════════════════════════════════════════════
 */
(function() {
const InputState = SMASH.InputState;

// ── Controller type detection ────────────────────────────────────
const CONTROLLER_TYPES = {
    UNKNOWN:    'unknown',
    KEYBOARD:   'keyboard',
    SWITCH_PRO: 'switch_pro',
    PS4:        'ps4',
    PS5:        'ps5',
    XBOX:       'xbox',
};

function detectControllerType(gamepad) {
    if (!gamepad) return CONTROLLER_TYPES.UNKNOWN;
    const id = gamepad.id.toLowerCase();

    // Nintendo Switch Pro Controller
    if (id.includes('pro controller') || id.includes('057e-2009')) {
        return CONTROLLER_TYPES.SWITCH_PRO;
    }

    // PlayStation (vendor 054c = Sony)
    if (id.includes('dualsense') || id.includes('054c-0ce6')) {
        return CONTROLLER_TYPES.PS5;
    }
    if (id.includes('dualshock') || id.includes('wireless controller') || id.includes('054c-')) {
        return CONTROLLER_TYPES.PS4;  // PS4 or generic PS
    }

    // Xbox controllers
    if (id.includes('xbox') || id.includes('xinput') || id.includes('045e-')) {
        return CONTROLLER_TYPES.XBOX;
    }

    return CONTROLLER_TYPES.UNKNOWN;
}

// ── Button mappings per controller type ──────────────────────────
const SWITCH_PRO_MAP = {
    attack:  [1],           // A button (right)
    special: [0],           // B button (bottom)
    jump:    [2, 3],        // Y, X buttons
    shield:  [4, 6],        // L, ZL
    grab:    [5, 7],        // R, ZR
    pause:   [9],           // + button
};

const PS_MAP = {
    attack:  [0],           // Cross (bottom)
    special: [1],           // Circle (right)
    jump:    [2, 3],        // Square, Triangle
    shield:  [4, 6],        // L1, L2
    grab:    [5, 7],        // R1, R2
    pause:   [9],           // Options
};

const XBOX_MAP = {
    attack:  [0],           // A button
    special: [1],           // B button
    jump:    [2, 3],        // X, Y buttons
    shield:  [4, 6],        // LB, LT
    grab:    [5, 7],        // RB, RT
    pause:   [9],           // Start/Menu
};

// ── Keyboard layouts ─────────────────────────────────────────────
const KEYBOARD_LAYOUTS = {
    wasd: {
        left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
        attack: 'Comma', special: 'Period', jump: 'Space',
        shield: 'ShiftLeft', grab: 'KeyE', pause: 'Escape',
    },
    arrows: {
        left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
        attack: 'Numpad1', special: 'Numpad2', jump: 'Numpad0',
        shield: 'Numpad3', grab: 'Numpad4', pause: 'Escape',
    },
    ijkl: {
        left: 'KeyJ', right: 'KeyL', up: 'KeyI', down: 'KeyK',
        attack: 'KeyO', special: 'KeyP', jump: 'Semicolon',
        shield: 'BracketLeft', grab: 'KeyU', pause: 'Escape',
    },
};

// ── Deadzone for analog sticks ───────────────────────────────────
const DEADZONE = 0.2;

// ══════════════════════════════════════════════════════════════════
//  DeviceManager — Tracks connected devices and assignments
// ══════════════════════════════════════════════════════════════════

class DeviceManager {
    constructor() {
        this._devices = [];           // Array of {type, index/layout, name, assigned}
        this._assignments = {};       // port → device
        this._lastScan = 0;
    }

    // Scan for connected devices (gamepads + keyboard)
    scan() {
        const now = performance.now();
        if (now - this._lastScan < 500) return;  // throttle scans
        this._lastScan = now;

        this._devices = [];

        // Always include keyboard layouts as available devices
        this._devices.push({
            type: CONTROLLER_TYPES.KEYBOARD,
            layout: 'wasd',
            name: 'Keyboard (WASD)',
            id: 'kbd-wasd',
        });
        this._devices.push({
            type: CONTROLLER_TYPES.KEYBOARD,
            layout: 'arrows',
            name: 'Keyboard (Arrows)',
            id: 'kbd-arrows',
        });
        this._devices.push({
            type: CONTROLLER_TYPES.KEYBOARD,
            layout: 'ijkl',
            name: 'Keyboard (IJKL)',
            id: 'kbd-ijkl',
        });

        // Scan gamepads
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp) continue;

            const type = detectControllerType(gp);
            const name = this._getControllerName(type, gp);
            this._devices.push({
                type,
                index: i,
                name,
                id: `gp-${i}`,
                gamepadId: gp.id,
            });
        }
    }

    _getControllerName(type, gp) {
        switch (type) {
            case CONTROLLER_TYPES.SWITCH_PRO: return `Switch Pro Controller (#${gp.index})`;
            case CONTROLLER_TYPES.PS4:        return `PS4 Controller (#${gp.index})`;
            case CONTROLLER_TYPES.PS5:        return `PS5 Controller (#${gp.index})`;
            case CONTROLLER_TYPES.XBOX:       return `Xbox Controller (#${gp.index})`;
            default:                          return `Controller (#${gp.index})`;
        }
    }

    getDevices() {
        return this._devices;
    }

    assignDevice(port, deviceId) {
        const device = this._devices.find(d => d.id === deviceId);
        if (!device) return false;
        this._assignments[port] = device;
        return true;
    }

    getAssignment(port) {
        return this._assignments[port] || null;
    }

    clearAssignment(port) {
        delete this._assignments[port];
    }

    clearAllAssignments() {
        this._assignments = {};
    }
}

// ══════════════════════════════════════════════════════════════════
//  InputManager — Unified controller interface
// ══════════════════════════════════════════════════════════════════

class InputManager {
    constructor(deviceConfig) {
        // deviceConfig = { type, index/layout, buttonMap (optional) }
        this.deviceType = deviceConfig.type || CONTROLLER_TYPES.UNKNOWN;
        this.gamepadIndex = deviceConfig.index;
        this.keyboardLayout = deviceConfig.layout || 'wasd';

        // Button map (for remapping support)
        this._buttonMap = deviceConfig.buttonMap || this._getDefaultButtonMap();

        // Keyboard state (shared static tracking)
        if (this.deviceType === CONTROLLER_TYPES.KEYBOARD) {
            this._initKeyboardTracking();
        }

        // Gamepad previous button states (for edge detection)
        this._prevButtons = {};
        this._prevPause = false;
    }

    _getDefaultButtonMap() {
        switch (this.deviceType) {
            case CONTROLLER_TYPES.SWITCH_PRO:
                return JSON.parse(JSON.stringify(SWITCH_PRO_MAP));
            case CONTROLLER_TYPES.PS4:
            case CONTROLLER_TYPES.PS5:
                return JSON.parse(JSON.stringify(PS_MAP));
            case CONTROLLER_TYPES.XBOX:
            case CONTROLLER_TYPES.UNKNOWN:
                return JSON.parse(JSON.stringify(XBOX_MAP));
            case CONTROLLER_TYPES.KEYBOARD:
                return KEYBOARD_LAYOUTS[this.keyboardLayout] || KEYBOARD_LAYOUTS.wasd;
            default:
                return JSON.parse(JSON.stringify(XBOX_MAP));
        }
    }

    _initKeyboardTracking() {
        if (!InputManager._keyboardInit) {
            InputManager._allDown = new Set();
            InputManager._framePressed = new Set();

            window.addEventListener('keydown', e => {
                if (!InputManager._allDown.has(e.code)) {
                    InputManager._framePressed.add(e.code);
                }
                InputManager._allDown.add(e.code);
            });

            window.addEventListener('keyup', e => {
                InputManager._allDown.delete(e.code);
            });

            InputManager._keyboardInit = true;
        }
    }

    // ── Poll input (returns InputState + pause flag) ────────────
    poll() {
        const result = { input: new InputState(), pause: false };

        if (this.deviceType === CONTROLLER_TYPES.KEYBOARD) {
            this._pollKeyboard(result);
        } else {
            this._pollGamepad(result);
        }

        return result;
    }

    _pollKeyboard(result) {
        const inp = result.input;
        const down = InputManager._allDown;
        const jp = InputManager._framePressed;
        const keys = this._buttonMap;

        // Movement (held)
        if (down.has(keys.left))  inp.moveX -= 1;
        if (down.has(keys.right)) inp.moveX += 1;
        if (down.has(keys.up))    inp.moveY -= 1;
        if (down.has(keys.down))  inp.moveY += 1;

        // Actions (just-pressed)
        inp.jump    = jp.has(keys.jump);
        inp.attack  = jp.has(keys.attack);
        inp.special = jp.has(keys.special);
        inp.grab    = jp.has(keys.grab);

        // Shield (held)
        inp.shield = down.has(keys.shield);

        // Pause (just-pressed)
        result.pause = jp.has(keys.pause);
    }

    _pollGamepad(result) {
        const inp = result.input;
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[this.gamepadIndex];
        if (!gp) return;

        // Left stick
        let lx = gp.axes[0] || 0;
        let ly = gp.axes[1] || 0;
        if (Math.abs(lx) < DEADZONE) lx = 0;
        if (Math.abs(ly) < DEADZONE) ly = 0;
        inp.moveX += lx;
        inp.moveY += ly;

        // D-Pad (buttons 12-15)
        if (gp.buttons[14] && gp.buttons[14].pressed) inp.moveX -= 1; // left
        if (gp.buttons[15] && gp.buttons[15].pressed) inp.moveX += 1; // right
        if (gp.buttons[12] && gp.buttons[12].pressed) inp.moveY -= 1; // up
        if (gp.buttons[13] && gp.buttons[13].pressed) inp.moveY += 1; // down

        // Clamp movement
        inp.moveX = Math.max(-1, Math.min(1, inp.moveX));
        inp.moveY = Math.max(-1, Math.min(1, inp.moveY));

        // Map buttons (just-pressed for actions, held for shield)
        const map = this._buttonMap;
        
        inp.jump    = this._isJustPressed(gp, map.jump);
        inp.attack  = this._isJustPressed(gp, map.attack);
        inp.special = this._isJustPressed(gp, map.special);
        inp.grab    = this._isJustPressed(gp, map.grab);

        // Shield = any shield button held
        inp.shield = this._isHeld(gp, map.shield);

        // Pause = just pressed
        const pauseNow = this._isHeld(gp, map.pause);
        result.pause = pauseNow && !this._prevPause;
        this._prevPause = pauseNow;
    }

    _isJustPressed(gp, buttonIndices) {
        if (!buttonIndices || !buttonIndices.length) return false;
        for (const idx of buttonIndices) {
            if (idx >= gp.buttons.length) continue;
            const down = gp.buttons[idx] && gp.buttons[idx].pressed;
            const was = !!this._prevButtons[idx];
            if (down && !was) {
                this._prevButtons[idx] = down;
                return true;
            }
            this._prevButtons[idx] = down;
        }
        return false;
    }

    _isHeld(gp, buttonIndices) {
        if (!buttonIndices || !buttonIndices.length) return false;
        for (const idx of buttonIndices) {
            if (idx >= gp.buttons.length) continue;
            if (gp.buttons[idx] && gp.buttons[idx].pressed) {
                return true;
            }
        }
        return false;
    }

    // ── Remapping API ────────────────────────────────────────────
    remapButton(action, buttonIndex) {
        // action = 'attack', 'special', 'jump', 'shield', 'grab', 'pause'
        if (!this._buttonMap[action]) return false;
        
        if (this.deviceType === CONTROLLER_TYPES.KEYBOARD) {
            // buttonIndex is a key code string
            this._buttonMap[action] = buttonIndex;
        } else {
            // buttonIndex is a gamepad button number
            this._buttonMap[action] = [buttonIndex];
        }
        return true;
    }

    getButtonMap() {
        return JSON.parse(JSON.stringify(this._buttonMap));
    }

    setButtonMap(map) {
        this._buttonMap = JSON.parse(JSON.stringify(map));
    }

    // ── Static frame cleanup (call once per game frame) ─────────
    static clearFrame() {
        if (InputManager._framePressed) {
            InputManager._framePressed.clear();
        }
    }

    // ── Device info ──────────────────────────────────────────────
    getDeviceInfo() {
        if (this.deviceType === CONTROLLER_TYPES.KEYBOARD) {
            return {
                type: this.deviceType,
                layout: this.keyboardLayout,
                name: `Keyboard (${this.keyboardLayout.toUpperCase()})`,
            };
        } else {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = gamepads[this.gamepadIndex];
            return {
                type: this.deviceType,
                index: this.gamepadIndex,
                name: gp ? gp.id : 'Disconnected',
                connected: !!gp,
            };
        }
    }
}

// ══════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════

SMASH.InputManager = InputManager;
SMASH.DeviceManager = DeviceManager;
SMASH.CONTROLLER_TYPES = CONTROLLER_TYPES;

})();
