/**
 * Hitbox.js — Rect and circle hitbox shapes, hurtbox, collision math.
 */
(function() {
const S = SMASH.Settings;

// =====================================================================
// Collision utilities
// =====================================================================
const Collision = {
    /** AABB vs AABB */
    rectRect(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    },

    /** Circle vs AABB */
    circleRect(cx, cy, cr, rx, ry, rw, rh) {
        const closestX = Math.max(rx, Math.min(cx, rx + rw));
        const closestY = Math.max(ry, Math.min(cy, ry + rh));
        const dx = cx - closestX;
        const dy = cy - closestY;
        return (dx * dx + dy * dy) <= (cr * cr);
    },

    /** Circle vs Circle */
    circleCircle(ax, ay, ar, bx, by, br) {
        const dx = ax - bx;
        const dy = ay - by;
        const sum = ar + br;
        return (dx * dx + dy * dy) <= (sum * sum);
    },
};

// =====================================================================
// Hurtbox — always a rect, separate from sprite bounds
// =====================================================================
class Hurtbox {
    constructor(fighter) {
        this.fighter = fighter;
        // Slightly narrower than visual for fairness
        this.widthRatio  = 0.75;
        this.heightRatio = 0.92;
    }

    getRect() {
        const f = this.fighter;
        const w = f.data.width  * this.widthRatio;
        const h = f.data.height * this.heightRatio;
        const x = f.x + (f.data.width  - w) / 2;
        const y = f.y + (f.data.height - h);
        return { x, y, w, h };
    }
}

// =====================================================================
// Hitbox — per-attack damage region (rect OR circle)
// =====================================================================
class Hitbox {
    /**
     * @param {object} opts
     * @param {'rect'|'circle'} opts.shape
     * @param {number} opts.ownerPort
     * @param {number} opts.offsetX      offset from fighter center (facing right)
     * @param {number} opts.offsetY      offset from fighter center
     * @param {number} [opts.width]      rect width
     * @param {number} [opts.height]     rect height
     * @param {number} [opts.radius]     circle radius
     * @param {number} opts.damage
     * @param {number} opts.baseKB
     * @param {number} opts.kbScaling
     * @param {number} opts.angle        launch angle (degrees, 0=right 90=up)
     * @param {number} opts.activeFrames
     */
    constructor(opts) {
        this.shape      = opts.shape || 'rect';
        this.ownerPort  = opts.ownerPort;
        this.offsetX    = opts.offsetX || 0;
        this.offsetY    = opts.offsetY || 0;
        this.width      = opts.width  || 60;
        this.height     = opts.height || 40;
        this.radius     = opts.radius || 30;
        this.damage     = opts.damage || 10;
        this.baseKB     = opts.baseKB || 200;
        this.kbScaling  = opts.kbScaling || 1.0;
        this.angle      = opts.angle  || 45;
        this.activeFrames    = opts.activeFrames || 3;
        this.framesRemaining = opts.activeFrames || 3;
        this.alreadyHit = new Set();
    }

    isActive() { return this.framesRemaining > 0; }

    tick() { if (this.framesRemaining > 0) this.framesRemaining--; }

    /** World-space center of the hitbox. */
    getWorldCenter(fx, fy, fw, fh, facing) {
        const cx = fx + fw / 2 + this.offsetX * facing;
        const cy = fy + fh / 2 + this.offsetY;
        return { x: cx, y: cy };
    }

    /** World-space bounding rect (for rect shape or bounding box of circle). */
    getWorldRect(fx, fy, fw, fh, facing) {
        const c = this.getWorldCenter(fx, fy, fw, fh, facing);
        if (this.shape === 'circle') {
            return {
                x: c.x - this.radius,
                y: c.y - this.radius,
                w: this.radius * 2,
                h: this.radius * 2,
            };
        }
        return {
            x: c.x - this.width / 2,
            y: c.y - this.height / 2,
            w: this.width,
            h: this.height,
        };
    }

    /** Launch angle adjusted for facing direction. */
    getLaunchAngle(facing) {
        return facing === -1 ? 180 - this.angle : this.angle;
    }

    /**
     * Test collision against a target fighter's hurtbox.
     * @returns {boolean} true on NEW hit
     */
    checkHit(attackerFighter, targetFighter) {
        if (targetFighter.port === this.ownerPort) return false;
        if (this.alreadyHit.has(targetFighter.port)) return false;
        if (targetFighter.invincible) return false;

        const hr = targetFighter.hurtbox.getRect();
        const c  = this.getWorldCenter(
            attackerFighter.x, attackerFighter.y,
            attackerFighter.data.width, attackerFighter.data.height,
            attackerFighter.facing
        );

        let hit = false;
        if (this.shape === 'circle') {
            hit = Collision.circleRect(c.x, c.y, this.radius, hr.x, hr.y, hr.w, hr.h);
        } else {
            const wr = this.getWorldRect(
                attackerFighter.x, attackerFighter.y,
                attackerFighter.data.width, attackerFighter.data.height,
                attackerFighter.facing
            );
            hit = Collision.rectRect(wr.x, wr.y, wr.w, wr.h, hr.x, hr.y, hr.w, hr.h);
        }

        if (hit) this.alreadyHit.add(targetFighter.port);
        return hit;
    }

    /**
     * Test collision from arbitrary position (for projectiles).
     */
    checkHitAt(wx, wy, pw, ph, facing, targetFighter) {
        if (targetFighter.port === this.ownerPort) return false;
        if (this.alreadyHit.has(targetFighter.port)) return false;
        if (targetFighter.invincible) return false;

        const hr = targetFighter.hurtbox.getRect();
        const c  = this.getWorldCenter(wx, wy, pw, ph, facing);

        let hit = false;
        if (this.shape === 'circle') {
            hit = Collision.circleRect(c.x, c.y, this.radius, hr.x, hr.y, hr.w, hr.h);
        } else {
            const wr = this.getWorldRect(wx, wy, pw, ph, facing);
            hit = Collision.rectRect(wr.x, wr.y, wr.w, wr.h, hr.x, hr.y, hr.w, hr.h);
        }

        if (hit) this.alreadyHit.add(targetFighter.port);
        return hit;
    }

    /** Projectile-vs-projectile collision (bounding circles). */
    checkProjectileCollision(selfPos, selfSize, otherPos, otherSize) {
        const r1 = Math.max(selfSize.w, selfSize.h) / 2;
        const r2 = Math.max(otherSize.w, otherSize.h) / 2;
        return Collision.circleCircle(
            selfPos.x + selfSize.w/2, selfPos.y + selfSize.h/2, r1,
            otherPos.x + otherSize.w/2, otherPos.y + otherSize.h/2, r2
        );
    }

    /** Create from AttackData. */
    static fromAttack(ownerPort, atk) {
        return new Hitbox({
            shape:        atk.hitboxShape || 'rect',
            ownerPort,
            offsetX:      atk.hitboxX,
            offsetY:      atk.hitboxY,
            width:        atk.hitboxW,
            height:       atk.hitboxH,
            radius:       atk.hitboxR || Math.max(atk.hitboxW, atk.hitboxH) / 2,
            damage:       atk.damage,
            baseKB:       atk.baseKB,
            kbScaling:    atk.kbScaling,
            angle:        atk.angle,
            activeFrames: atk.activeFrames,
        });
    }
}

// =====================================================================
// Debug rendering helpers
// =====================================================================
Hitbox.debugDraw = function(ctx, hitbox, fx, fy, fw, fh, facing, cam) {
    if (!S.DEBUG_HITBOXES) return;
    const c = hitbox.getWorldCenter(fx, fy, fw, fh, facing);
    const sx = cam.wtsx(c.x);
    const sy = cam.wtsy(c.y);

    ctx.save();
    ctx.globalAlpha = 0.35;
    if (hitbox.shape === 'circle') {
        ctx.fillStyle = '#ff3030';
        ctx.beginPath();
        ctx.arc(sx, sy, hitbox.radius * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.stroke();
    } else {
        const wr = hitbox.getWorldRect(fx, fy, fw, fh, facing);
        ctx.fillStyle = '#ff3030';
        ctx.fillRect(
            cam.wtsx(wr.x), cam.wtsy(wr.y),
            wr.w * cam.zoom, wr.h * cam.zoom
        );
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            cam.wtsx(wr.x), cam.wtsy(wr.y),
            wr.w * cam.zoom, wr.h * cam.zoom
        );
    }
    ctx.restore();
};

Hurtbox.debugDraw = function(ctx, hurtbox, cam) {
    if (!S.DEBUG_HURTBOXES) return;
    const r = hurtbox.getRect();
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#30ff30';
    ctx.fillRect(cam.wtsx(r.x), cam.wtsy(r.y), r.w * cam.zoom, r.h * cam.zoom);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.strokeRect(cam.wtsx(r.x), cam.wtsy(r.y), r.w * cam.zoom, r.h * cam.zoom);
    ctx.restore();
};

// Export
SMASH.Collision = Collision;
SMASH.Hurtbox   = Hurtbox;
SMASH.Hitbox    = Hitbox;
})();
