/**
 * KeyboardController.js — Three preset keyboard layouts.
 */
(function() {
const InputState = SMASH.InputState;

const LAYOUTS = {
    wasd: {
        left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
        jump: 'KeyW', attack: 'KeyF', special: 'KeyG', shield: 'KeyH', grab: 'KeyT',
    },
    arrows: {
        left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
        jump: 'ArrowUp', attack: 'Numpad1', special: 'Numpad2', shield: 'Numpad3', grab: 'Numpad0',
    },
    ijkl: {
        left: 'KeyJ', right: 'KeyL', up: 'KeyI', down: 'KeyK',
        jump: 'KeyI', attack: 'KeyO', special: 'KeyP', shield: 'Semicolon', grab: 'KeyU',
    },
};

class KeyboardController {
    constructor(layoutName) {
        this.keys = LAYOUTS[layoutName] || LAYOUTS.wasd;
        this._down = new Set();
        this._justPressed = new Set();

        // Shared key event tracking (static, shared across instances)
        if (!KeyboardController._initialized) {
            KeyboardController._allDown = new Set();
            KeyboardController._framePressed = new Set();
            window.addEventListener('keydown', e => {
                if (!KeyboardController._allDown.has(e.code)) {
                    KeyboardController._framePressed.add(e.code);
                }
                KeyboardController._allDown.add(e.code);
            });
            window.addEventListener('keyup', e => {
                KeyboardController._allDown.delete(e.code);
            });
            KeyboardController._initialized = true;
        }
    }

    poll() {
        const inp  = new InputState();
        const down = KeyboardController._allDown;
        const jp   = KeyboardController._framePressed;

        // Axes
        if (down.has(this.keys.left))  inp.moveX -= 1;
        if (down.has(this.keys.right)) inp.moveX += 1;
        if (down.has(this.keys.up))    inp.moveY -= 1;
        if (down.has(this.keys.down))  inp.moveY += 1;

        // Just-pressed actions
        inp.jump    = jp.has(this.keys.jump);
        inp.attack  = jp.has(this.keys.attack);
        inp.special = jp.has(this.keys.special);
        inp.grab    = jp.has(this.keys.grab);

        // Held
        inp.shield = down.has(this.keys.shield);

        return inp;
    }

    /** Call once per game frame AFTER all controllers have polled. */
    static clearFrame() {
        if (KeyboardController._framePressed) {
            KeyboardController._framePressed.clear();
        }
    }
}

KeyboardController._initialized = false;

SMASH.KeyboardController = KeyboardController;
SMASH.KEYBOARD_LAYOUTS   = LAYOUTS;
})();
