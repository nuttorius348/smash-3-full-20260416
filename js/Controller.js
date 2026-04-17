/**
 * Controller.js — InputState data class and abstract controller.
 */
(function() {

class InputState {
    constructor() {
        this.moveX   = 0;   // -1 left … +1 right
        this.moveY   = 0;   // -1 up   … +1 down
        this.jump    = false;
        this.attack  = false;
        this.special = false;
        this.specialHeld = false;
        this.shield  = false;
        this.grab    = false;
    }
    reset() {
        this.moveX = 0; this.moveY = 0;
        this.jump = false; this.attack = false;
        this.special = false; this.specialHeld = false;
        this.shield = false; this.grab = false;
    }
}

SMASH.InputState = InputState;
})();
