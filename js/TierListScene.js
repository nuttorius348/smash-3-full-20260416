/**
 * TierListScene.js — In-game sprite tier list viewer.
 */
(function () {
const S = SMASH.Settings;

const LAYOUT = {
    badgeW: 68,
    cardW: 96,
    cardH: 86,
    rowH: 120,
    startY: 84,
    gridX: 96,
    gap: 10,
};

const TIER_ROWS = [
    {
        label: 'OP',
        color: '#f97316',
        entries: [
            {
                name: 'Fazbear',
                sprite: 'assets/sprite_fazbear.png',
                who: 'Fazbear is a burst-heavy brawler that can swing a match with huge momentum changes.',
                why: 'Placed in OP because of high damage output, comeback potential, and very threatening kill confirms.'
            },
            {
                name: 'Von',
                sprite: 'assets/sprite_vaughan2.jpg',
                who: 'Von is the transformed form after two ultimates, turning him into a power monster.',
                why: 'Placed in OP because this form gets massive pressure and overwhelming damage threat once online.'
            },
            {
                name: 'Sahur',
                sprite: 'assets/sprite_Sahur.jfif',
                who: 'Sahur is a bat-focused fighter that can quickly build meter and force explosive mid-game swings.',
                why: 'Placed in OP for dominant charged pressure, very high kill threat, and explosive momentum from Bat Breaker setups.'
            },
        ],
    },
    {
        label: 'S',
        color: '#facc15',
        entries: [
            {
                name: 'Droid',
                sprite: 'assets/sprite_droid.jpg',
                who: 'Droid is a technical all-rounder with strong spacing and reliable punish windows.',
                why: 'Placed in S for consistency, safe pressure, and strong matchup coverage into most of the cast.'
            },
            {
                name: 'Trump',
                sprite: 'assets/sprite_trump.jpg',
                who: 'Trump is a volatile pressure fighter with explosive special options and fast snowballing.',
                why: 'Placed in S due to high reward neutral wins and strong conversion power in clutch moments.'
            },
            {
                name: 'Netanyahu',
                sprite: 'assets/sprite_netanyahu.png',
                who: 'Netanyahu is a tricky resource-oriented fighter that can generate huge value over time.',
                why: 'Placed in S because of strong utility tools, strong specials, and excellent setplay control.'
            },
            {
                name: 'Kirky',
                sprite: 'assets/sprite_kirky.png',
                who: 'Kirky is a mobile offensive character with solid aerial pressure and tempo control.',
                why: 'Placed in S for top-tier mobility and the ability to force favorable engagements repeatedly.'
            },
        ],
    },
    {
        label: 'A',
        color: '#34d399',
        entries: [
            {
                name: 'Epstein',
                sprite: 'assets/sprite_epstein.png',
                who: 'Epstein is a spacing-focused pick with good punish options and stable neutral control.',
                why: 'Placed in A because he is strong and dependable, but less oppressive than S and OP choices.'
            },
            {
                name: 'Speed',
                sprite: 'assets/sprite_speed.jpg',
                who: 'Speed is a fast rushdown character that thrives on momentum and whiff punishment.',
                why: 'Placed in A for speed-driven offense and pressure, with some risk when neutral is lost.'
            },
            {
                name: 'Diddy',
                sprite: 'assets/sprite_diddy.jpg',
                who: 'Diddy is a balanced aggressor with good movement and practical combo starters.',
                why: 'Placed in A due to strong all-around tools without the same ceiling as top-tier threats.'
            },
            {
                name: 'Kiddo',
                sprite: 'assets/sprite_kiddo.jpg',
                who: 'Kiddo is a scrappy fighter with meter interactions and high burst potential on confirms.',
                why: 'Placed in A because of strong swing potential and good pressure, but less stable than S tier.'
            },
            {
                name: 'Aru',
                sprite: 'assets/sprite_aru.png',
                who: 'Aru is a versatile pick with flexible ranges and useful teamfight interactions.',
                why: 'Placed in A for reliable utility and solid matchups, though not as dominant as top tiers.'
            },
            {
                name: 'Bomber',
                sprite: 'assets/sprite_bomber.png',
                who: 'Bomber is a high-threat specialist focused on explosive confirms and zoning checks.',
                why: 'Placed in A due to big reward options, balanced by commitment and punishable windows.'
            },
        ],
    },
    {
        label: 'B',
        color: '#60a5fa',
        entries: [
            {
                name: 'Metabot',
                sprite: 'assets/sprite_metabot.png',
                who: 'Metabot is a heavy utility fighter with decent range and situational power spikes.',
                why: 'Placed in B because he can perform well but is more matchup-dependent and less consistent.'
            },
            {
                name: 'Nutsak',
                sprite: 'assets/sprite_speedster.jpg',
                who: 'Nutsak is a fast skirmisher that relies on momentum and clean execution to shine.',
                why: 'Placed in B due to strong highs but higher volatility and reduced consistency under pressure.'
            },
            {
                name: 'Frankie',
                sprite: 'assets/sprite_grappler.jpg',
                who: 'Frankie is a heavyweight bruiser with strong hits but slower overall pacing.',
                why: 'Placed in B because he can punish hard but struggles when kited by faster characters.'
            },
            {
                name: 'Slaveish',
                sprite: 'assets/sprite_zoner.png',
                who: 'Slaveish is a zoning-oriented control fighter focused on spacing and projectile setups.',
                why: 'Placed in B for good control tools that are weaker when opponents close distance quickly.'
            },
            {
                name: 'Lazer',
                sprite: 'assets/sprite_brawler.jpg',
                who: 'Lazer is a straightforward fundamentals character with balanced options.',
                why: 'Placed in B because he is stable and simple, but lacks extreme win-condition pressure.'
            },
        ],
    },
    {
        label: 'F',
        color: '#c084fc',
        entries: [
            {
                name: 'Vaughan',
                sprite: 'assets/sprite_vaughan1.PNG',
                who: 'Vaughan is the pre-transform base form before unlocking the Von state.',
                why: 'Placed in F because this form is considered much weaker until the transformation power spike.'
            },
        ],
    },
];

class TierListScene {
    constructor(canvas, onBack) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onBack = onBack;

        this._running = false;
        this._raf = null;

        this._keys = new Set();
        this._lastKeys = new Set();
        this._mouseX = 0;
        this._mouseY = 0;
        this._mouseClicked = false;
        this._selectedEntry = null;
        this._selectedTier = null;

        this._images = new Map();
        this._loadImages();

        this._boundKeyDown = e => this._keys.add(e.code);
        this._boundKeyUp = e => this._keys.delete(e.code);
        this._boundMouseMove = e => {
            const r = this.canvas.getBoundingClientRect();
            this._mouseX = (e.clientX - r.left) * (S.W / r.width);
            this._mouseY = (e.clientY - r.top) * (S.H / r.height);
        };
        this._boundMouseClick = () => { this._mouseClicked = true; };
    }

    _loadImages() {
        for (const row of TIER_ROWS) {
            for (const entry of row.entries) {
                const img = new Image();
                img.src = entry.sprite;
                this._images.set(entry.sprite, img);
            }
        }
    }

    _justPressed(code) {
        return this._keys.has(code) && !this._lastKeys.has(code);
    }

    _backBtnRect() {
        return { x: 20, y: 20, w: 120, h: 40 };
    }

    _detailRect() {
        const w = Math.min(980, S.W - 120);
        const h = 300;
        return {
            x: (S.W - w) / 2,
            y: (S.H - h) / 2,
            w,
            h,
        };
    }

    _pointInRect(px, py, r) {
        return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    }

    _cardRects() {
        const out = [];
        for (let i = 0; i < TIER_ROWS.length; i++) {
            const row = TIER_ROWS[i];
            const y = LAYOUT.startY + i * LAYOUT.rowH;
            for (let j = 0; j < row.entries.length; j++) {
                const entry = row.entries[j];
                const x = LAYOUT.gridX + 10 + j * (LAYOUT.cardW + LAYOUT.gap);
                const cy = y + 16;
                out.push({
                    rect: { x, y: cy, w: LAYOUT.cardW, h: LAYOUT.cardH },
                    tier: row,
                    entry,
                });
            }
        }
        return out;
    }

    start() {
        this._running = true;
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
        this.canvas.addEventListener('mousemove', this._boundMouseMove);
        this.canvas.addEventListener('click', this._boundMouseClick);
        this._loop();
    }

    stop() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        this.canvas.removeEventListener('mousemove', this._boundMouseMove);
        this.canvas.removeEventListener('click', this._boundMouseClick);
    }

    _loop() {
        if (!this._running) return;
        this._update();
        this._render();
        this._lastKeys = new Set(this._keys);
        this._mouseClicked = false;
        this._raf = requestAnimationFrame(() => this._loop());
    }

    _update() {
        if (this._selectedEntry) {
            if (this._justPressed('Escape') || this._justPressed('Backspace') ||
                this._justPressed('Enter') || this._justPressed('Space')) {
                this._selectedEntry = null;
                this._selectedTier = null;
                return;
            }

            if (this._mouseClicked) {
                const dr = this._detailRect();
                if (!this._pointInRect(this._mouseX, this._mouseY, dr)) {
                    this._selectedEntry = null;
                    this._selectedTier = null;
                }
            }
            return;
        }

        if (this._justPressed('Escape') || this._justPressed('Backspace') || this._justPressed('Enter')) {
            this.stop();
            if (this.onBack) this.onBack();
            return;
        }

        if (this._mouseClicked) {
            const cards = this._cardRects();
            for (const c of cards) {
                if (this._pointInRect(this._mouseX, this._mouseY, c.rect)) {
                    this._selectedEntry = c.entry;
                    this._selectedTier = c.tier;
                    return;
                }
            }
        }

        const bb = this._backBtnRect();
        if (this._mouseClicked &&
            this._mouseX >= bb.x && this._mouseX <= bb.x + bb.w &&
            this._mouseY >= bb.y && this._mouseY <= bb.y + bb.h) {
            this.stop();
            if (this.onBack) this.onBack();
        }
    }

    _render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, S.W, S.H);

        const bg = ctx.createLinearGradient(0, 0, S.W, S.H);
        bg.addColorStop(0, '#0b1220');
        bg.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 42px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText('SPRITE TIER LIST', S.W / 2, 38);
        ctx.fillText('SPRITE TIER LIST', S.W / 2, 38);

        ctx.font = '13px Arial';
        ctx.fillStyle = '#a5b4fc';
        ctx.fillText('Click a sprite for character details and tier reason', S.W / 2, 64);

        for (let i = 0; i < TIER_ROWS.length; i++) {
            const row = TIER_ROWS[i];
            const y = LAYOUT.startY + i * LAYOUT.rowH;

            ctx.fillStyle = row.color;
            ctx.fillRect(16, y + 8, LAYOUT.badgeW, LAYOUT.rowH - 18);
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 2;
            ctx.strokeRect(16, y + 8, LAYOUT.badgeW, LAYOUT.rowH - 18);

            ctx.fillStyle = '#0b1220';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(row.label, 16 + LAYOUT.badgeW / 2, y + LAYOUT.rowH / 2);

            const gridW = S.W - LAYOUT.gridX - 16;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
            ctx.fillRect(LAYOUT.gridX, y + 8, gridW, LAYOUT.rowH - 18);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
            ctx.strokeRect(LAYOUT.gridX, y + 8, gridW, LAYOUT.rowH - 18);

            for (let j = 0; j < row.entries.length; j++) {
                const entry = row.entries[j];
                const x = LAYOUT.gridX + 10 + j * (LAYOUT.cardW + LAYOUT.gap);
                const cy = y + 16;

                ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
                ctx.fillRect(x, cy, LAYOUT.cardW, LAYOUT.cardH);
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
                ctx.strokeRect(x, cy, LAYOUT.cardW, LAYOUT.cardH);

                const img = this._images.get(entry.sprite);
                if (img && img.complete && img.naturalWidth > 0) {
                    const iw = LAYOUT.cardW - 12;
                    const ih = LAYOUT.cardH - 10;
                    ctx.drawImage(img, x + 6, cy + 4, iw, ih);
                } else {
                    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
                    ctx.fillRect(x + 6, cy + 4, LAYOUT.cardW - 12, LAYOUT.cardH - 10);
                }
            }
        }

        const bb = this._backBtnRect();
        ctx.fillStyle = 'rgba(60,60,80,0.8)';
        ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 2;
        ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
        ctx.fillStyle = '#e5e7eb';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('← BACK', bb.x + bb.w / 2, bb.y + bb.h / 2);

        this._renderDetails(ctx);
    }

    _renderDetails(ctx) {
        if (!this._selectedEntry || !this._selectedTier) return;

        const dr = this._detailRect();

        ctx.save();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
        ctx.fillRect(0, 0, S.W, S.H);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(dr.x, dr.y, dr.w, dr.h);
        ctx.strokeStyle = this._selectedTier.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(dr.x, dr.y, dr.w, dr.h);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 30px Arial';
        ctx.fillText(this._selectedEntry.name, dr.x + 22, dr.y + 18);

        ctx.font = 'bold 17px Arial';
        ctx.fillStyle = this._selectedTier.color;
        ctx.fillText(`Tier: ${this._selectedTier.label}`, dr.x + 24, dr.y + 58);

        const bodyX = dr.x + 24;
        let bodyY = dr.y + 92;
        const wrapW = dr.w - 48;

        bodyY = this._drawWrappedText(
            ctx,
            `Who: ${this._selectedEntry.who}`,
            bodyX,
            bodyY,
            wrapW,
            22,
            '#dbeafe'
        );

        bodyY += 10;
        this._drawWrappedText(
            ctx,
            `Why this tier: ${this._selectedEntry.why}`,
            bodyX,
            bodyY,
            wrapW,
            22,
            '#fde68a'
        );

        ctx.font = '13px Arial';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Click outside or press ESC / Enter / Space to close', dr.x + 24, dr.y + dr.h - 26);

        ctx.restore();
    }

    _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, color) {
        ctx.font = '16px Arial';
        ctx.fillStyle = color;

        const words = text.split(' ');
        let line = '';
        let cursorY = y;

        for (let i = 0; i < words.length; i++) {
            const test = line ? `${line} ${words[i]}` : words[i];
            if (ctx.measureText(test).width > maxWidth && line) {
                ctx.fillText(line, x, cursorY);
                line = words[i];
                cursorY += lineHeight;
            } else {
                line = test;
            }
        }

        if (line) {
            ctx.fillText(line, x, cursorY);
            cursorY += lineHeight;
        }

        return cursorY;
    }
}

SMASH.TierListScene = TierListScene;
})();
