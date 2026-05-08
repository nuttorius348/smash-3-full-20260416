/**
 * Unlocks.js - Persistent character unlocks (localStorage).
 */
(function () {
const SAVE_KEY = 'smash3_unlocks_v1';
const DEFAULT_LOCKED = {
    ultra_lazer: true,
    super_perfect_cell: true,
    cell: true,
    cell_semi: true,
    cell_perfect: true,
};

let _state = null;

function _load() {
    if (_state) return _state;
    let data = {};
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) data = JSON.parse(raw) || {};
    } catch (err) {
        console.warn('Failed to load unlocks:', err);
    }
    for (const [key, locked] of Object.entries(DEFAULT_LOCKED)) {
        if (data[key] == null) data[key] = locked;
    }
    _state = data;
    return _state;
}

function _save() {
    if (!_state) return;
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(_state));
    } catch (err) {
        console.warn('Failed to save unlocks:', err);
    }
}

function isUnlocked(key) {
    const st = _load();
    if (st[key] == null) return true;
    return st[key] === false;
}

function unlockCharacter(key) {
    const st = _load();
    st[key] = false;
    _save();
}

function lockCharacter(key) {
    const st = _load();
    st[key] = true;
    _save();
}

function getSelectableCharacterKeys() {
    const roster = SMASH.ROSTER || {};
    const keys = Object.keys(roster);
    return keys.filter(key => {
        const entry = roster[key];
        if (entry && entry.selectable === false) return false;
        return isUnlocked(key);
    });
}

function getState() {
    return Object.assign({}, _load());
}

SMASH.Unlocks = {
    isUnlocked,
    unlockCharacter,
    lockCharacter,
    getSelectableCharacterKeys,
    getState,
};
})();
