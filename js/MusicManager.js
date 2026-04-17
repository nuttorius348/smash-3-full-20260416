/**
 * MusicManager.js — Simple background music manager.
 *
 * Tracks:
 *   'main'        — main menu + singleplayer character select
 *   'multiplayer'  — multiplayer menu + lobby
 *   'battle'       — all battles (single & multiplayer)
 *
 * Usage:
 *   SMASH.Music.play('main');    // crossfades to main theme
 *   SMASH.Music.play('battle');  // crossfades to battle theme
 *   SMASH.Music.stop();          // fade out current track
 */
(function () {

const TRACKS = {
    main:        'assets/song_main.mp3',
    multiplayer: 'assets/song_multiplayer_menu.mp3',
    battle:      'assets/song_battle.mp3',
};

const FADE_MS  = 600;   // crossfade duration
const VOLUME   = 0.35;  // default volume (0–1)

class MusicManager {
    constructor() {
        this._audios  = {};   // key → Audio element
        this._current = null; // currently playing track key
        this._vol     = VOLUME;
        this._enabled = true;

        // Pre-create Audio elements so they're ready instantly
        for (const [key, src] of Object.entries(TRACKS)) {
            const a = new Audio(src);
            a.loop   = true;
            a.volume = 0;
            a.preload = 'auto';
            this._audios[key] = a;
        }
    }

    /** Play a track by key. No-op if already playing that track. */
    play(key) {
        if (!this._enabled) return;
        if (!this._audios[key]) return;
        // If we think this track is current but it's actually paused
        // (e.g. browser blocked autoplay), allow a retry
        if (this._current === key && !this._audios[key].paused) return;

        // Fade out old track (if different)
        if (this._current && this._current !== key && this._audios[this._current]) {
            this._fadeOut(this._audios[this._current]);
        }

        // Fade in new track
        this._current = key;
        const audio = this._audios[key];
        audio.currentTime = 0;
        audio.volume = 0;

        // Must handle play() promise (browsers block autoplay until user gesture)
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});

        this._fadeIn(audio);
    }

    /** Stop all music with a fade out. */
    stop() {
        if (this._current && this._audios[this._current]) {
            this._fadeOut(this._audios[this._current]);
        }
        this._current = null;
    }

    setEnabled(enabled) {
        this._enabled = enabled !== false;
        if (!this._enabled) {
            this.stop();
        }
    }

    isEnabled() {
        return this._enabled;
    }

    /** Set master volume (0–1). */
    setVolume(v) {
        this._vol = Math.max(0, Math.min(1, v));
        if (this._current && this._audios[this._current]) {
            this._audios[this._current].volume = this._vol;
        }
    }

    // ── Internal fades ───────────────────────────────────────────

    _fadeIn(audio) {
        const target = this._vol;
        const steps  = 20;
        const dt     = FADE_MS / steps;
        let step = 0;
        const iv = setInterval(() => {
            step++;
            audio.volume = Math.min(target, (step / steps) * target);
            if (step >= steps) clearInterval(iv);
        }, dt);
    }

    _fadeOut(audio) {
        const start = audio.volume;
        if (start <= 0) { audio.pause(); return; }
        const steps = 15;
        const dt    = FADE_MS / steps;
        let step = 0;
        const iv = setInterval(() => {
            step++;
            audio.volume = Math.max(0, start * (1 - step / steps));
            if (step >= steps) {
                clearInterval(iv);
                audio.pause();
                audio.volume = 0;
            }
        }, dt);
    }
}

// Singleton
SMASH.Music = new MusicManager();

})();
