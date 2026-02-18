/**
 * GamepadController.js — SDL-style gamepad input via Gamepad API.
 */
(function() {
const InputState = SMASH.InputState;

const DEADZONE = 0.2;

class GamepadController {
    constructor(padIndex) {
        this._padIndex = padIndex || 0;
        this._prevButtons = {};
    }

    poll() {
        const inp = new InputState();
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[this._padIndex];
        if (!gp) return inp;

        // Left stick
        let lx = gp.axes[0] || 0;
        let ly = gp.axes[1] || 0;
        if (Math.abs(lx) < DEADZONE) lx = 0;
        if (Math.abs(ly) < DEADZONE) ly = 0;
        inp.moveX = lx;
        inp.moveY = ly;

        // Buttons (just-pressed)
        const btnMap = { 0: 'jump', 2: 'attack', 3: 'special', 4: 'grab' };
        for (const [idx, attr] of Object.entries(btnMap)) {
            const i     = parseInt(idx);
            const down  = gp.buttons[i] && gp.buttons[i].pressed;
            const was   = !!this._prevButtons[i];
            inp[attr]   = down && !was;
            this._prevButtons[i] = down;
        }

        // Shield = RB (5) held
        inp.shield = gp.buttons[5] && gp.buttons[5].pressed;

        return inp;
    }
}

SMASH.GamepadController = GamepadController;
})();
