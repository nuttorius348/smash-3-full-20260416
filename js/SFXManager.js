/**
 * SFXManager.js — Sound effects for hits.
 *
 * Plays a generic hit sound on every hit, plus a character-specific
 * hurt sound if one exists for the defender.
 *
 * Usage:
 *   SMASH.SFX.playHit(characterKey);
 */
(function () {

const POOL_SIZE = 6;   // how many concurrent instances per sound

/* ── Character-key → hurt sound file mapping ────────────────── */
const HURT_SOUNDS = {
    brawler:   'assets/soundeffect_lazer_hurt.mp3',
    zoner:     'assets/soundeffect_slaveish_hurt.mp3',
    grappler:  'assets/soundeffect_frankie_hurt.mp3',
    netanyahu: 'assets/soundeffect_netanyahu.mp3',
    trump:     'assets/soundeffect_trump.mp3',
    kirky:     'assets/soundeffect_kirky.mp3',
    kiddo:     'assets/soundeffect_kiddo.mp3',
    fazbear:   'assets/soundeffect_fazbear.mp3',
    epstein:   'assets/soundeffect_epstein.mp3',
    droid:     'assets/soundeffect_droid.mp3',
    bomber:    'assets/soundeffect_bomber.mp3',
};

const HIT_SRC = 'assets/soundeffect_hit.mp3';

const EVENT_SOUNDS = {
    countdown: 'assets/soundeffect_countdown.mp3',
    trump:     'assets/soundeffect_trump.mp3',
    powerup:   'assets/soundeffect_powerup.mp3',
    groundpound:'assets/soundeffect_groundpound.mp3',
    fly:       'assets/soundeffect_fly.mp3',
    finisher:  'assets/soundeffect_finisher.mp3',
    gameReady: 'assets/game ready.mp3',
    selectAny: 'assets/SND_SE_SYSTEM_FIXED_L.wav',
    stageFall: 'assets/snd_se_common_stage_fall.wav',
    newChallenger: 'assets/New_Challenger.mp3',
};

const CHARACTER_SELECT_SOUNDS = {
    aru:       'assets/Aru_selected (mp3cut.net).mp3',
    bomber:    'assets/Bomber_selected (mp3cut.net).mp3',
    diddy:     'assets/Diddy_selected (mp3cut.net).mp3',
    droid:     'assets/Droid_selected (mp3cut.net).mp3',
    epstein:   'assets/Epstein_selected (mp3cut.net).mp3',
    fazbear:   'assets/Fazbear_selected (mp3cut.net).mp3',
    grappler:  'assets/Frankie_selected (mp3cut.net).mp3',
    kiddo:     'assets/Kiddo_selected (mp3cut.net).mp3',
    kirky:     'assets/Kirky_selected (mp3cut.net).mp3',
    brawler:   'assets/Lazer_selected (mp3cut.net).mp3',
    metabot:   'assets/MetaBot_selected (mp3cut.net).mp3',
    netanyahu: 'assets/Netanyahu_selected (mp3cut.net).mp3',
    speedster: 'assets/Nutsak_selected (mp3cut.net).mp3',
    zoner:     'assets/Slaveish_selected (mp3cut.net).mp3',
    speed:     'assets/Speed_selected (mp3cut.net).mp3',
    trump:     'assets/Trump_selected (mp3cut.net).mp3',
    vaughan:   'assets/Vaughan_selected.mp3',
};

const HIT_VOLUME  = 0.45;
const HURT_VOLUME = 0.85;
const EVENT_VOLUME = 0.9;
const SELECT_VOLUME = 0.95;

const EVENT_VOLUMES = {
    selectAny: 0.25,
};

/* ── Character-specific volume overrides ──────────────────── */
const HURT_VOLUMES = {
    zoner: 1.0,  // Slaveish - maximum valid volume
    // others use HURT_VOLUME default
};

function makePool(src, vol) {
    const pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        const a = new Audio(src);
        a.volume  = vol;
        a.preload = 'auto';
        pool.push(a);
    }
    return pool;
}

class SFXManager {
    constructor() {
        this._hitPool  = makePool(HIT_SRC, HIT_VOLUME);
        this._hitIdx   = 0;

        this._hurtPools = {};
        for (const [key, src] of Object.entries(HURT_SOUNDS)) {
            const vol = HURT_VOLUMES[key] || HURT_VOLUME;
            this._hurtPools[key] = makePool(src, vol);
        }
        this._hurtIdx = {};

        this._eventPools = {};
        this._eventIdx = {};
        for (const [key, src] of Object.entries(EVENT_SOUNDS)) {
            const vol = EVENT_VOLUMES[key] !== undefined ? EVENT_VOLUMES[key] : EVENT_VOLUME;
            this._eventPools[key] = makePool(src, vol);
            this._eventIdx[key] = 0;
        }

        this._selectPools = {};
        this._selectIdx = {};
        for (const [key, src] of Object.entries(CHARACTER_SELECT_SOUNDS)) {
            this._selectPools[key] = makePool(src, SELECT_VOLUME);
            this._selectIdx[key] = 0;
        }
    }

    /**
     * Play hit SFX.  Called from Fighter.takeHit().
     * @param {string} charKey — defender's character key (e.g. 'brawler')
     */
    playHit(charKey) {
        // Generic hit sound
        this._play(this._hitPool, '_hitIdx');

        // Character-specific hurt sound
        if (charKey && this._hurtPools[charKey]) {
            if (!this._hurtIdx[charKey]) this._hurtIdx[charKey] = 0;
            this._playKeyed(this._hurtPools[charKey], charKey);
        }
    }

    playCountdown() { this._playEvent('countdown'); }
    playTrump() { this._playEvent('trump'); }
    playUltimateReady() { this._playEvent('powerup'); }
    playDownSpecial() { this._playEvent('groundpound'); }
    playUpSpecial() { this._playEvent('fly'); }
    playFinisher() { this._playEvent('finisher'); }
    playGameReady() { this._playEvent('gameReady'); }
    playSelectAny() { this._playEvent('selectAny'); }
    playStageFall() { this._playEvent('stageFall'); }
    playNewChallenger() { this._playEvent('newChallenger'); }

    playCharacterSelect(charKey) {
        const pool = this._selectPools[charKey];
        if (!pool) return;
        const idx = this._selectIdx[charKey] % pool.length;
        this._selectIdx[charKey]++;
        const a = pool[idx];
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
    }

    /* ── internals ──────────────────────────────────────────── */

    _play(pool, idxProp) {
        const a = pool[this[idxProp] % pool.length];
        this[idxProp]++;
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
    }

    _playKeyed(pool, key) {
        const idx = this._hurtIdx[key] % pool.length;
        this._hurtIdx[key]++;
        const a = pool[idx];
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
    }

    _playEvent(key) {
        const pool = this._eventPools[key];
        if (!pool) return;
        const idx = this._eventIdx[key] % pool.length;
        this._eventIdx[key]++;
        const a = pool[idx];
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
    }
}

SMASH.SFX = new SFXManager();

})();
