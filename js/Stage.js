/**
 * Stage.js — Platform and Stage (Map) classes.
 *
 * ══════════════════════════════════════════════════════════════════
 *  PLATFORM TYPES
 * ══════════════════════════════════════════════════════════════════
 *  • Solid       (passthrough=false) — blocks from all sides
 *  • Passthrough (passthrough=true)  — land-on-top only
 *  • Moving      (motion config)     — animated platform path
 *
 *  Moving Platform Config:
 *    motion: {
 *      type: 'linear' | 'loop' | 'pendulum',
 *      waypoints: [{x, y}, ...],     // world positions
 *      speed: pixels/second,
 *      pauseFrames: frames to wait at each waypoint (default 0)
 *    }
 *
 *  MAP CLASS
 * ══════════════════════════════════════════════════════════════════
 *  • name, platforms[], blastZone, spawns[]
 *  • Multiple vertical levels (ground, mid, high, sky)
 *  • Background layers with parallax data
 *  • Stage hazards (optional future)
 *  • update(dt) — ticks all moving platforms
 *  • render(ctx, cam) — draws everything
 * ══════════════════════════════════════════════════════════════════
 */
(function() {

// ══════════════════════════════════════════════════════════════════
//  Platform
// ══════════════════════════════════════════════════════════════════

class Platform {
    /**
     * @param {number} x        World X
     * @param {number} y        World Y
     * @param {number} w        Width
     * @param {number} h        Height
     * @param {boolean} passthrough  True = drop-through
     * @param {object}  [motion]     Moving platform config
     * @param {object}  [style]      Visual overrides {fill, stroke, label}
     */
    constructor(x, y, w, h, passthrough, motion, style) {
        this.rect        = { x, y, w, h };
        this.passthrough = passthrough !== false;
        this.style       = style || null;

        // ── Moving platform state ────────────────────────────────
        this.motion = motion || null;
        this.isMoving = !!motion;

        if (this.isMoving) {
            this._originX  = x;
            this._originY  = y;
            this._wpIdx    = 0;       // current waypoint target
            this._wpDir    = 1;       // +1 forward, -1 backward (pendulum)
            this._pauseTimer = 0;
            this._prevX    = x;
            this._prevY    = y;
            // velocity applied to riders
            this.velX      = 0;
            this.velY      = 0;
        } else {
            this.velX = 0;
            this.velY = 0;
        }
    }

    // ── Tick (called by Stage.update) ────────────────────────────
    update(dt) {
        if (!this.isMoving) return;
        const m = this.motion;
        const wps = m.waypoints;
        if (!wps || wps.length < 2) return;

        // Pause at waypoint
        if (this._pauseTimer > 0) {
            this._pauseTimer--;
            this.velX = 0;
            this.velY = 0;
            return;
        }

        const target = wps[this._wpIdx];
        const dx = target.x - this.rect.x;
        const dy = target.y - this.rect.y;
        const dist = Math.hypot(dx, dy);
        const speed = (m.speed || 100) * dt;

        this._prevX = this.rect.x;
        this._prevY = this.rect.y;

        if (dist <= speed) {
            // Arrived at waypoint
            this.rect.x = target.x;
            this.rect.y = target.y;
            this._pauseTimer = m.pauseFrames || 0;
            this._advanceWaypoint(wps, m.type);
        } else {
            // Move toward waypoint
            const nx = dx / dist;
            const ny = dy / dist;
            this.rect.x += nx * speed;
            this.rect.y += ny * speed;
        }

        // Platform velocity (for carrying riders)
        this.velX = (this.rect.x - this._prevX) / dt;
        this.velY = (this.rect.y - this._prevY) / dt;
    }

    _advanceWaypoint(wps, type) {
        switch (type) {
            case 'pendulum':
                this._wpIdx += this._wpDir;
                if (this._wpIdx >= wps.length) {
                    this._wpIdx = wps.length - 2;
                    this._wpDir = -1;
                } else if (this._wpIdx < 0) {
                    this._wpIdx = 1;
                    this._wpDir = 1;
                }
                break;
            case 'loop':
                this._wpIdx = (this._wpIdx + 1) % wps.length;
                break;
            case 'linear':
            default:
                if (this._wpIdx < wps.length - 1) this._wpIdx++;
                else this._wpIdx = 0; // restart
                break;
        }
    }

    // ── Render ───────────────────────────────────────────────────
    render(ctx, cam) {
        const sx = cam.wtsx(this.rect.x);
        const sy = cam.wtsy(this.rect.y);
        const sw = this.rect.w * cam.zoom;
        const sh = this.rect.h * cam.zoom;

        const s = this.style || {};

        // Fill
        if (this.passthrough) {
            ctx.fillStyle = s.fill || 'rgba(90,122,90,0.85)';
        } else {
            ctx.fillStyle = s.fill || '#4a4a5a';
        }
        ctx.fillRect(sx, sy, sw, sh);

        // Top edge highlight
        ctx.strokeStyle = s.stroke || (this.passthrough ? '#8aba8a' : '#7a7a9a');
        ctx.lineWidth = Math.max(1, 2 * cam.zoom);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + sw, sy);
        ctx.stroke();

        // Moving platform indicator
        if (this.isMoving) {
            ctx.strokeStyle = '#f0dc28';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
            ctx.setLineDash([]);
        }

        // Label
        if (s.label && cam.zoom > 0.4) {
            ctx.font = `${Math.round(10 * cam.zoom)}px Arial`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'center';
            ctx.fillText(s.label, sx + sw / 2, sy + sh / 2 + 4 * cam.zoom);
        }
    }
}

// ══════════════════════════════════════════════════════════════════
//  Stage (Map)
// ══════════════════════════════════════════════════════════════════

class Stage {
    /**
     * @param {object} cfg
     *   name:       string
     *   platforms:  Platform[]
     *   blastZone:  {x, y, w, h}
     *   spawns:     [[x,y], ...]
     *   bgColor:    string
     *   bgLayers:   [{color, rects:[{x,y,w,h}], parallax:0-1}, ...]
     *   cameraBounds: {minX, maxX, minY, maxY}  — optional camera limit
     */
    constructor(cfg) {
        this.name        = cfg.name;
        this.platforms   = cfg.platforms || [];
        this.blastZone   = cfg.blastZone;
        this.spawns      = cfg.spawns;
        this.bgColor     = cfg.bgColor || '#1a1a2e';
        this.bgLayers    = cfg.bgLayers || [];
        this.cameraBounds = cfg.cameraBounds || null;
    }

    getSpawn(i) { return this.spawns[i % this.spawns.length]; }

    // ── Update all moving platforms ──────────────────────────────
    update(dt) {
        for (const p of this.platforms) {
            if (p.isMoving) p.update(dt);
        }
    }

    // ── Render ───────────────────────────────────────────────────
    render(ctx, cam) {
        this.renderBackground(ctx, cam);
        this.renderPlatforms(ctx, cam);
    }

    renderBackground(ctx, cam) {
        // Solid base
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, 0, SMASH.Settings.W, SMASH.Settings.H);

        // Parallax layers
        for (const layer of this.bgLayers) {
            const px = layer.parallax || 0;
            ctx.fillStyle = layer.color || 'rgba(255,255,255,0.03)';
            for (const r of (layer.rects || [])) {
                const ox = (cam.x * px) * cam.zoom;
                const oy = (cam.y * px) * cam.zoom;
                const sx = cam.wtsx(r.x) - ox * px;
                const sy = cam.wtsy(r.y) - oy * px;
                ctx.fillRect(sx, sy, r.w * cam.zoom, r.h * cam.zoom);
            }
        }

        // Blast zone debug outline
        if (SMASH.Settings.DEBUG_HITBOXES) {
            const bz = this.blastZone;
            ctx.strokeStyle = 'rgba(255,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(
                cam.wtsx(bz.x), cam.wtsy(bz.y),
                bz.w * cam.zoom, bz.h * cam.zoom
            );
            ctx.setLineDash([]);
        }
    }

    renderPlatforms(ctx, cam) {
        for (const p of this.platforms) p.render(ctx, cam);
    }
}

// ── Legacy wrapper: old constructor signature support ────────────
// Old: new Stage(name, platforms, blastZone, spawns, bgColor)
// New: new Stage({name, platforms, blastZone, spawns, bgColor, ...})
const OrigStage = Stage;
const WrappedStage = function(nameOrCfg, platforms, blastZone, spawns, bgColor) {
    if (typeof nameOrCfg === 'object' && !Array.isArray(nameOrCfg)) {
        return new OrigStage(nameOrCfg);
    }
    // Legacy positional args
    return new OrigStage({
        name: nameOrCfg,
        platforms, blastZone, spawns, bgColor
    });
};
WrappedStage.prototype = OrigStage.prototype;

SMASH.Platform = Platform;
SMASH.Stage    = WrappedStage;
SMASH._StageClass = OrigStage;  // direct access for StageLibrary
})();
