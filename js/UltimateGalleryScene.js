/**
 * UltimateGalleryScene.js — Browse and watch all character ultimate videos.
 *
 * Shows a grid of all characters. Click one (or press Enter) to play
 * its ultimate cutscene video. Press Escape or click Back to return
 * to the main menu.
 */
(function () {
const S = SMASH.Settings;

class UltimateGalleryScene {
    constructor(canvas, onBack) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.onBack  = onBack;   // callback to return to main menu

        // Load character data
        const keys = SMASH.getCharacterKeys();
        this.characters = keys.map(key => {
            const r = SMASH.ROSTER[key];
            const fd = new SMASH.FighterData(key);
            return {
                key,
                name:  r.name || key,
                color: r.color || '#888',
                video: r.ultimateAttack ? r.ultimateAttack.cutsceneVideo : null,
                ultName: r.ultimateAttack ? r.ultimateAttack.name : 'Unknown',
                data: fd,
            };
        });

        this.selected = 0;       // cursor index
        this._playing = false;   // true while a video is active

        // ── Video element (reuse or create) ──────────────────────
        this._videoEl = document.getElementById('galleryVideo');
        if (!this._videoEl) {
            const el = document.createElement('video');
            el.id = 'galleryVideo';
            el.style.cssText = `
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                object-fit: cover;
                z-index: 600;
                display: none;
                background: #000;
            `;
            el.playsInline = true;
            el.muted = false;
            el.preload = 'auto';
            document.body.appendChild(el);
            this._videoEl = el;
        }

        // ── Input state ──────────────────────────────────────────
        this._keys     = new Set();
        this._lastKeys = new Set();
        this._mouseX   = 0;
        this._mouseY   = 0;
        this._mouseClicked = false;

        this._raf = null;
        this._running = false;
        this._boundKeyDown   = e => this._keys.add(e.code);
        this._boundKeyUp     = e => this._keys.delete(e.code);
        this._boundMouseMove = e => {
            const r = this.canvas.getBoundingClientRect();
            this._mouseX = (e.clientX - r.left) * (S.W / r.width);
            this._mouseY = (e.clientY - r.top)  * (S.H / r.height);
        };
        this._boundMouseClick = () => { this._mouseClicked = true; };
    }

    // ══════════════════════════════════════════════════════════════
    //  Lifecycle
    // ══════════════════════════════════════════════════════════════
    start() {
        this._running = true;
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup',   this._boundKeyUp);
        this.canvas.addEventListener('mousemove', this._boundMouseMove);
        this.canvas.addEventListener('click',     this._boundMouseClick);

        this._videoEl.addEventListener('ended', this._onVideoEnded = () => {
            this._stopVideo();
        });

        this._loop();
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup',   this._boundKeyUp);
        this.canvas.removeEventListener('mousemove', this._boundMouseMove);
        this.canvas.removeEventListener('click',     this._boundMouseClick);
        if (this._onVideoEnded) {
            this._videoEl.removeEventListener('ended', this._onVideoEnded);
        }
        this._stopVideo();
    }

    _loop() {
        if (!this._running) return;
        this._update();
        this._render();
        this._lastKeys = new Set(this._keys);
        this._mouseClicked = false;
        this._raf = requestAnimationFrame(() => this._loop());
    }

    // ══════════════════════════════════════════════════════════════
    //  Input helpers
    // ══════════════════════════════════════════════════════════════
    _justPressed(code) {
        return this._keys.has(code) && !this._lastKeys.has(code);
    }

    // ══════════════════════════════════════════════════════════════
    //  Update
    // ══════════════════════════════════════════════════════════════
    _update() {
        // If video is playing, Escape or click stops it
        if (this._playing) {
            if (this._justPressed('Escape') || this._mouseClicked) {
                this._stopVideo();
            }
            return;
        }

        // Escape → back to menu
        if (this._justPressed('Escape') || this._justPressed('Backspace')) {
            this.stop();
            if (this.onBack) this.onBack();
            return;
        }

        // Grid navigation
        const cols = this._cols();
        if (this._justPressed('ArrowRight') || this._justPressed('KeyD')) {
            this.selected = Math.min(this.selected + 1, this.characters.length - 1);
        }
        if (this._justPressed('ArrowLeft') || this._justPressed('KeyA')) {
            this.selected = Math.max(this.selected - 1, 0);
        }
        if (this._justPressed('ArrowDown') || this._justPressed('KeyS')) {
            const next = this.selected + cols;
            if (next < this.characters.length) this.selected = next;
        }
        if (this._justPressed('ArrowUp') || this._justPressed('KeyW')) {
            const prev = this.selected - cols;
            if (prev >= 0) this.selected = prev;
        }

        // Enter → play selected video
        if (this._justPressed('Enter') || this._justPressed('NumpadEnter') || this._justPressed('Space')) {
            this._playVideo(this.selected);
        }

        // Mouse hover + click detection
        const rects = this._cardRects();
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (this._mouseX >= r.x && this._mouseX <= r.x + r.w &&
                this._mouseY >= r.y && this._mouseY <= r.y + r.h) {
                this.selected = i;
                if (this._mouseClicked) {
                    this._playVideo(i);
                }
            }
        }

        // Back button click
        const bb = this._backBtnRect();
        if (this._mouseClicked &&
            this._mouseX >= bb.x && this._mouseX <= bb.x + bb.w &&
            this._mouseY >= bb.y && this._mouseY <= bb.y + bb.h) {
            this.stop();
            if (this.onBack) this.onBack();
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  Video playback
    // ══════════════════════════════════════════════════════════════
    _playVideo(idx) {
        const ch = this.characters[idx];
        if (!ch || !ch.video) return;

        this._playing = true;
        const el = this._videoEl;
        el.src = ch.video;
        el.style.display = 'block';
        el.currentTime = 0;
        el.play().catch(() => {
            this._stopVideo();
        });
    }

    _stopVideo() {
        this._playing = false;
        const el = this._videoEl;
        el.pause();
        el.style.display = 'none';
        el.removeAttribute('src');
    }

    // ══════════════════════════════════════════════════════════════
    //  Layout helpers
    // ══════════════════════════════════════════════════════════════
    _cols() { return 4; }

    _cardRects() {
        const cols   = this._cols();
        const cardW  = 200;
        const cardH  = 200;
        const gap    = 24;
        const startY = 120;
        const rects  = [];

        for (let i = 0; i < this.characters.length; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const charsInRow = Math.min(cols, this.characters.length - row * cols);
            const rowW = charsInRow * cardW + (charsInRow - 1) * gap;
            const x = (S.W - rowW) / 2 + col * (cardW + gap);
            const y = startY + row * (cardH + gap);
            rects.push({ x, y, w: cardW, h: cardH });
        }
        return rects;
    }

    _backBtnRect() {
        return { x: 20, y: 20, w: 120, h: 40 };
    }

    // ══════════════════════════════════════════════════════════════
    //  Render
    // ══════════════════════════════════════════════════════════════
    _render() {
        if (this._playing) return; // video overlay is on top

        const ctx = this.ctx;
        ctx.clearRect(0, 0, S.W, S.H);

        // Background
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, S.W, S.H);

        // Title
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 42px Arial';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText('ULTIMATE GALLERY', S.W / 2, 60);
        ctx.fillText('ULTIMATE GALLERY', S.W / 2, 60);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#888';
        ctx.fillText('Select a character to watch their ultimate', S.W / 2, 95);
        ctx.restore();

        // Character cards
        const rects = this._cardRects();
        for (let i = 0; i < this.characters.length; i++) {
            const ch = this.characters[i];
            const r  = rects[i];
            const isSel = i === this.selected;

            // Card bg
            ctx.fillStyle = isSel ? 'rgba(80,80,140,0.6)' : 'rgba(30,30,50,0.5)';
            ctx.fillRect(r.x, r.y, r.w, r.h);

            // Border
            ctx.strokeStyle = isSel ? '#fff' : '#444';
            ctx.lineWidth   = isSel ? 3 : 1;
            ctx.strokeRect(r.x, r.y, r.w, r.h);

            // Sprite
            const sprH = r.h - 70;
            if (ch.data && ch.data.spriteLoaded && ch.data.spriteImage) {
                ctx.drawImage(ch.data.spriteImage, r.x + 20, r.y + 12, r.w - 40, sprH);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.fillRect(r.x + 20, r.y + 12, r.w - 40, sprH);
            }

            // Character name
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = 'bold 18px Arial';
            ctx.fillStyle = ch.color;
            ctx.fillText(ch.name.toUpperCase(), r.x + r.w / 2, r.y + r.h - 38);

            // Ultimate name
            ctx.font = '13px Arial';
            ctx.fillStyle = isSel ? '#ccc' : '#666';
            ctx.fillText(ch.ultName, r.x + r.w / 2, r.y + r.h - 18);

            // "No video" badge
            if (!ch.video) {
                ctx.font = '11px Arial';
                ctx.fillStyle = '#f44';
                ctx.fillText('NO VIDEO', r.x + r.w / 2, r.y + r.h - 4);
            }
            ctx.restore();

            // Highlight glow for selected
            if (isSel) {
                ctx.save();
                ctx.shadowColor = ch.color;
                ctx.shadowBlur = 20;
                ctx.strokeStyle = ch.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(r.x, r.y, r.w, r.h);
                ctx.restore();
            }
        }

        // Back button
        const bb = this._backBtnRect();
        ctx.fillStyle = 'rgba(60,60,80,0.7)';
        ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
        ctx.fillStyle = '#ccc';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('← BACK', bb.x + bb.w / 2, bb.y + bb.h / 2);

        // Footer
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '13px Arial';
        ctx.fillStyle = '#555';
        ctx.fillText('Arrow keys / WASD: Navigate  •  Enter / Click: Play  •  Escape: Back', S.W / 2, S.H - 20);
        ctx.restore();
    }
}

SMASH.UltimateGalleryScene = UltimateGalleryScene;
})();
