/**
 * Projectile.js — Full modular projectile entity system.
 *
 * ══════════════════════════════════════════════════════════════════
 *  ARCHITECTURE
 * ══════════════════════════════════════════════════════════════════
 *  Projectile (base)         — independent entity with own hitbox,
 *                              lifetime, velocity, optional gravity,
 *                              stage & player collision.
 *
 *  Subtypes:
 *    LinearProjectile        — straight line (simple energy ball)
 *    ArcProjectile           — affected by gravity (lobbed attacks)
 *    BoomerangProjectile     — returns to origin after max distance
 *    PiercingProjectile      — passes through fighters, doesn't die
 *    StationaryProjectile    — sits in place (traps / zones)
 *
 *  Archetypes (complex, templated):
 *    LaserBeam               — long, thin, fast, piercing, short-lived
 *    BlastProjectile         — large, slow, high damage, explodes on hit
 *    BarrelProjectile        — heavy, gravity, bounces off walls
 *    EnergyWave              — wide, travels along ground, dies on edges
 *
 *  ProjectileManager         — spawn, update, render, prune dead,
 *                              proj-vs-proj cancel, death-spawn queue
 *
 *  Stage Collision Modes:
 *    'none'       — ignores stage entirely
 *    'destroy'    — dies on contact with solid platforms
 *    'bounce'     — reflects velocity on solid platform hit
 *    'slide'      — follows ground surface (energy waves)
 *    'stick'      — embeds in platform and stays
 *
 * ══════════════════════════════════════════════════════════════════
 */
(function() {
const S         = SMASH.Settings;
const Hitbox    = SMASH.Hitbox;
const Collision = SMASH.Collision;

// =====================================================================
//  Base Projectile — independent entity
// =====================================================================

class Projectile {
    /**
     * @param {object} opts
     *   ownerPort         number   port of the fighter who spawned this
     *   x, y              number   world spawn position (top-left)
     *   vx, vy            number   velocity (px/s)
     *   w, h              number   visual width/height
     *   lifetime          number   frames until auto-death
     *   damage            number   hit damage
     *   baseKB            number   base knockback
     *   kbScaling         number   knockback scaling
     *   angle             number   launch angle (degrees)
     *   shape             string   'rect' | 'circle'
     *   radius            number   hitbox radius (circle)
     *   gravity           number   gravity multiplier (0 = none)
     *   stageCollision    string   'none'|'destroy'|'bounce'|'slide'|'stick'
     *   piercing          boolean  pass through fighters without dying
     *   maxHits           number   max unique fighters to hit (0=unlimited)
     *   color             string   override render color
     *   trailLength       number   trail particle count (0=no trail)
     *   onDeathSpawn      object   spawn config on death (explosion)
     *   bounciness        number   velocity retention on bounce (0..1)
     *   maxBounces        number   max bounces before death
     *   groundSnap        boolean  snap to ground (energy waves)
     *   priority          number   proj-vs-proj cancel priority
     */
    constructor(opts) {
        // ── Identity ─────────────────────────────────────────────
        this.ownerPort = opts.ownerPort;
        this.type      = opts.type || 'linear';
        this.alive     = true;

        // ── Transform ────────────────────────────────────────────
        this.x  = opts.x  || 0;
        this.y  = opts.y  || 0;
        this.vx = opts.vx || 0;
        this.vy = opts.vy || 0;
        this.w  = opts.w  || 22;
        this.h  = opts.h  || 22;
        this.facing   = this.vx >= 0 ? 1 : -1;
        this.rotation = 0;

        // ── Lifetime ─────────────────────────────────────────────
        this.lifetime    = opts.lifetime || 120;
        this.maxLifetime = this.lifetime;
        this.age         = 0;

        // ── Physics ──────────────────────────────────────────────
        this.gravity        = opts.gravity !== undefined ? opts.gravity : 0;
        this.stageCollision = opts.stageCollision || 'none';
        this.bounciness     = opts.bounciness !== undefined ? opts.bounciness : 0.6;
        this.maxBounces     = opts.maxBounces !== undefined ? opts.maxBounces : 3;
        this._bounceCount   = 0;
        this.groundSnap     = opts.groundSnap || false;
        this._onGround      = false;

        // ── Combat ───────────────────────────────────────────────
        this.piercing  = opts.piercing || false;
        this.maxHits   = opts.maxHits  || 0;
        this._hitCount = 0;

        this.hitbox = new Hitbox({
            shape:        opts.shape || 'circle',
            ownerPort:    this.ownerPort,
            offsetX:      0,
            offsetY:      0,
            width:        this.w,
            height:       this.h,
            radius:       opts.radius || Math.max(this.w, this.h) / 2,
            damage:       opts.damage  || 8,
            baseKB:       opts.baseKB  || 150,
            kbScaling:    opts.kbScaling || 0.7,
            angle:        opts.angle   || 30,
            activeFrames: this.lifetime + 10,
        });

        // ── Visuals ──────────────────────────────────────────────
        this.color       = opts.color || S.P_COLORS[this.ownerPort % 4];
        this.trailLength = opts.trailLength || 0;
        this._trail      = [];

        // ── Death spawn (explosion / fragments) ──────────────────
        this.onDeathSpawn = opts.onDeathSpawn || null;

        // ── Proj-vs-proj priority ────────────────────────────────
        this.priority    = opts.priority || 1;
        this._isExplosion = opts._isExplosion || false;
    }

    // ── Update ───────────────────────────────────────────────────

    update(dt) {
        if (!this.alive) return;

        // Gravity
        if (this.gravity !== 0) {
            this.vy += S.GRAVITY * this.gravity * dt;
        }

        // Integrate
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Visual rotation (spin for barrels)
        if (this.type === 'barrel') {
            this.rotation += Math.abs(this.vx) * dt * 0.02;
        }

        // Trail
        if (this.trailLength > 0) {
            this._trail.push({ x: this.x + this.w / 2, y: this.y + this.h / 2, age: 0 });
            for (const t of this._trail) t.age++;
            while (this._trail.length > this.trailLength) this._trail.shift();
        }

        // Lifetime
        this.age++;
        this.lifetime--;
        if (this.lifetime <= 0) this.kill();
    }

    // ── Stage collision ──────────────────────────────────────────

    collideStage(stage) {
        if (!this.alive || this.stageCollision === 'none') return;

        // Blast zone kill
        const bz = stage.blastZone;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        if (cx < bz.x || cx > bz.x + bz.w || cy < bz.y || cy > bz.y + bz.h) {
            this.alive = false;
            return;
        }

        // Platform collision
        for (const plat of stage.platforms) {
            if (plat.passthrough) {
                // Passthrough: only for ground-snap projectiles landing on top
                if (this.groundSnap && this.vy >= 0) {
                    if (this._checkTopCollision(plat)) return;
                }
                continue;
            }

            // Solid platform AABB check
            const pr = plat.rect;
            if (!Collision.rectRect(this.x, this.y, this.w, this.h,
                                    pr.x, pr.y, pr.w, pr.h)) continue;

            switch (this.stageCollision) {
                case 'destroy':
                    this.kill();
                    return;

                case 'bounce':
                    this._bounceOff(pr);
                    return;

                case 'slide':
                    this.y = pr.y - this.h;
                    this.vy = 0;
                    this._onGround = true;
                    return;

                case 'stick':
                    this.vx = 0;
                    this.vy = 0;
                    return;
            }
        }

        // Ground-snap edge death
        if (this.groundSnap && !this._onGround && this.age > 10) {
            let anyBelow = false;
            for (const plat of stage.platforms) {
                if (this.y + this.h < plat.rect.y + plat.rect.h + 200) {
                    anyBelow = true;
                    break;
                }
            }
            if (!anyBelow) this.kill();
        }
    }

    _checkTopCollision(plat) {
        const pr = plat.rect;
        if (this.x + this.w <= pr.x || this.x >= pr.x + pr.w) return false;
        if (this.y + this.h >= pr.y && this.y + this.h <= pr.y + 8) {
            this.y = pr.y - this.h;
            this.vy = 0;
            this._onGround = true;
            return true;
        }
        return false;
    }

    _bounceOff(pr) {
        this._bounceCount++;
        if (this._bounceCount > this.maxBounces) { this.kill(); return; }

        const oL = (this.x + this.w) - pr.x;
        const oR = (pr.x + pr.w) - this.x;
        const oT = (this.y + this.h) - pr.y;
        const oB = (pr.y + pr.h) - this.y;
        const m  = Math.min(oL, oR, oT, oB);

        if (m === oT || m === oB) {
            this.vy = -this.vy * this.bounciness;
            if (m === oT) this.y = pr.y - this.h;
            else          this.y = pr.y + pr.h;
        } else {
            this.vx = -this.vx * this.bounciness;
            if (m === oL) this.x = pr.x - this.w;
            else          this.x = pr.x + pr.w;
        }
    }

    // ── Player collision ─────────────────────────────────────────

    checkHits(fighters) {
        if (!this.alive) return;
        for (const f of fighters) {
            if (f.port === this.ownerPort || !f.isAlive) continue;
            if (f.invincible) continue;
            if (this.hitbox.checkHitAt(this.x, this.y, this.w, this.h, this.facing, f)) {
                f._lastHitBy = this.ownerPort;
                // Projectiles spawned by specials count as special hits
                f.takeHit(this.hitbox, this.facing, true);
                this._hitCount++;
                this.onHit(f);
                if (!this.alive) return;
            }
        }
    }

    /** Override in subtypes for custom on-hit behavior. */
    onHit(target) {
        if (this.piercing) {
            if (this.maxHits > 0 && this._hitCount >= this.maxHits) this.kill();
        } else {
            this.kill();
        }
    }

    kill() { this.alive = false; }

    // ── Render ───────────────────────────────────────────────────

    render(ctx, cam) {
        if (!this.alive) return;
        this._renderTrail(ctx, cam);
        this._renderBody(ctx, cam);
        if (S.DEBUG_HITBOXES) this._renderDebugHitbox(ctx, cam);
    }

    _renderTrail(ctx, cam) {
        if (this._trail.length < 2) return;
        ctx.save();
        for (const t of this._trail) {
            const alpha = Math.max(0, 1 - t.age / this.trailLength) * 0.4;
            const sx = cam.wtsx(t.x);
            const sy = cam.wtsy(t.y);
            const r  = (this.w / 3) * cam.zoom * (1 - t.age / this.trailLength);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _renderBody(ctx, cam) {
        const sx = cam.wtsx(this.x);
        const sy = cam.wtsy(this.y);
        const sw = this.w * cam.zoom;
        const sh = this.h * cam.zoom;

        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = this.color;

        if (this.rotation !== 0) {
            ctx.translate(sx + sw / 2, sy + sh / 2);
            ctx.rotate(this.rotation);
            ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
        } else {
            ctx.beginPath();
            ctx.arc(sx + sw / 2, sy + sh / 2, Math.max(sw, sh) / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    _renderDebugHitbox(ctx, cam) {
        const sx = cam.wtsx(this.x);
        const sy = cam.wtsy(this.y);
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, this.w * cam.zoom, this.h * cam.zoom);
        ctx.restore();
    }

    getCenter() { return { x: this.x + this.w / 2, y: this.y + this.h / 2 }; }
    getRadius() { return Math.max(this.w, this.h) / 2; }
}


// =====================================================================
//  Subtypes (simple behavior variants)
// =====================================================================

class LinearProjectile extends Projectile {
    constructor(opts) {
        super({ ...opts, type: 'linear', gravity: 0,
                stageCollision: opts.stageCollision || 'none' });
    }
}

class ArcProjectile extends Projectile {
    constructor(opts) {
        super({ ...opts, type: 'arc',
                gravity: opts.gravScale || opts.gravity || 1.0,
                stageCollision: opts.stageCollision || 'destroy' });
    }
}

class BoomerangProjectile extends Projectile {
    constructor(opts) {
        super({ ...opts, type: 'boomerang', gravity: 0,
                stageCollision: 'none', piercing: true });
        this.originX  = this.x;
        this.originY  = this.y;
        this.maxDist  = opts.maxDist || 400;
        this.returning = false;
        this.speed    = Math.hypot(this.vx, this.vy);
    }
    update(dt) {
        if (!this.alive) return;
        const dx = this.x - this.originX;
        const dy = this.y - this.originY;
        if (!this.returning && Math.hypot(dx, dy) >= this.maxDist) {
            this.returning = true;
            this.hitbox.alreadyHit.clear();
        }
        if (this.returning) {
            const tx = this.originX - this.x;
            const ty = this.originY - this.y;
            const d  = Math.hypot(tx, ty);
            if (d < 20) { this.alive = false; return; }
            this.vx = (tx / d) * this.speed;
            this.vy = (ty / d) * this.speed;
            this.facing = this.vx >= 0 ? 1 : -1;
        }
        super.update(dt);
    }
}

class PiercingProjectile extends Projectile {
    constructor(opts) {
        super({ ...opts, type: 'piercing', piercing: true });
    }
}

class StationaryProjectile extends Projectile {
    constructor(opts) {
        super({ ...opts, type: opts.type || 'stationary',
                stageCollision: 'none' });
        this.vx = 0;
        this.vy = 0;
    }
    update(dt) {
        if (!this.alive) return;
        this.age++;
        this.lifetime--;
        if (this.lifetime <= 0) this.alive = false;
    }
}


// =====================================================================
//  ARCHETYPES — Laser, Blast, Barrel, EnergyWave
// =====================================================================

// ─── 1. LASER BEAM ──────────────────────────────────────────────
//  Long, thin, blazing fast. Pierces up to maxHits targets.
//  Short lifetime. No gravity. Ignores stage.
//  Pulsing neon beam with bright white core and glow trail.
// ─────────────────────────────────────────────────────────────────
class LaserBeam extends Projectile {
    constructor(opts) {
        const d = {
            type: 'laser',
            w: 80, h: 8,
            damage: 6, baseKB: 80, kbScaling: 0.3, angle: 15,
            lifetime: 40,
            gravity: 0,
            stageCollision: 'none',
            piercing: true, maxHits: 3,
            trailLength: 12,
            shape: 'rect',
        };
        super({ ...d, ...opts, type: 'laser' });
        this._pulse = 0;
    }

    update(dt) {
        super.update(dt);
        this._pulse += dt * 15;
    }

    _renderBody(ctx, cam) {
        const sx = cam.wtsx(this.x);
        const sy = cam.wtsy(this.y);
        const sw = this.w * cam.zoom;
        const sh = this.h * cam.zoom;
        const p  = 1 + Math.sin(this._pulse) * 0.3;

        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 12 * p;

        // Outer beam
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.9;
        const bh = sh * p;
        ctx.fillRect(sx, sy + (sh - bh) / 2, sw, bh);

        // Bright core
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.7;
        const ch = bh * 0.4;
        ctx.fillRect(sx + 2, sy + (sh - ch) / 2, sw - 4, ch);

        ctx.restore();
    }

    _renderTrail(ctx, cam) {
        if (this._trail.length < 2) return;
        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.h * cam.zoom * 0.3;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        for (let i = 0; i < this._trail.length; i++) {
            const t = this._trail[i];
            const px = cam.wtsx(t.x);
            const py = cam.wtsy(t.y);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
    }
}


// ─── 2. BLAST PROJECTILE ────────────────────────────────────────
//  Large, slow, high damage. Explodes on contact creating a
//  short-lived stationary explosion hitbox for area damage.
// ─────────────────────────────────────────────────────────────────
class BlastProjectile extends Projectile {
    constructor(opts) {
        const d = {
            type: 'blast',
            w: 40, h: 40,
            damage: 18, baseKB: 300, kbScaling: 1.2, angle: 55,
            lifetime: 90,
            gravity: 0,
            stageCollision: 'destroy',
            piercing: false,
            trailLength: 8,
            shape: 'circle', radius: 20,
        };
        super({ ...d, ...opts, type: 'blast' });
        this._pulse = 0;

        // Explosion config
        this.explosionRadius = opts.explosionRadius || 60;
        this.explosionDamage = opts.explosionDamage || this.hitbox.damage * 0.5;
        this.explosionKB     = opts.explosionKB     || this.hitbox.baseKB * 0.6;
        this.explosionLife   = opts.explosionLife    || 15;
    }

    update(dt) {
        super.update(dt);
        this._pulse += dt * 8;
    }

    kill() {
        if (this.alive) {
            // Queue explosion spawn
            this.onDeathSpawn = {
                type: 'explosion',
                _isExplosion: true,
                ownerPort: this.ownerPort,
                x: this.x + this.w / 2 - this.explosionRadius,
                y: this.y + this.h / 2 - this.explosionRadius,
                w: this.explosionRadius * 2,
                h: this.explosionRadius * 2,
                radius: this.explosionRadius,
                damage: this.explosionDamage,
                baseKB: this.explosionKB,
                kbScaling: 0.8,
                angle: 60,
                lifetime: this.explosionLife,
                shape: 'circle',
                color: '#ff8800',
            };
        }
        this.alive = false;
    }

    _renderBody(ctx, cam) {
        const sx = cam.wtsx(this.x) + this.w * cam.zoom / 2;
        const sy = cam.wtsy(this.y) + this.h * cam.zoom / 2;
        const r  = (this.w / 2) * cam.zoom;
        const p  = 1 + Math.sin(this._pulse) * 0.15;

        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 16 * p;

        // Outer sphere
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(sx, sy, r * p, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // Danger ring
        ctx.strokeStyle = '#fff';
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r * p * 1.2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}


// ─── 3. BARREL PROJECTILE ───────────────────────────────────────
//  Heavy cannonball / barrel. Affected by gravity. Bounces off
//  solid platforms. Visually spins. Dies after max bounces.
// ─────────────────────────────────────────────────────────────────
class BarrelProjectile extends Projectile {
    constructor(opts) {
        const d = {
            type: 'barrel',
            w: 36, h: 36,
            damage: 14, baseKB: 250, kbScaling: 1.0, angle: 45,
            lifetime: 300,
            gravity: 1.2,
            stageCollision: 'bounce',
            bounciness: 0.55, maxBounces: 5,
            piercing: false,
            trailLength: 4,
            shape: 'circle', radius: 18,
        };
        super({ ...d, ...opts, type: 'barrel' });
    }

    _renderBody(ctx, cam) {
        const sx = cam.wtsx(this.x);
        const sy = cam.wtsy(this.y);
        const sw = this.w * cam.zoom;
        const cx = sx + sw / 2;
        const cy = sy + sw / 2;
        const r  = sw / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);

        // Barrel body
        ctx.fillStyle = '#8B6914';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Wooden cross
        ctx.strokeStyle = '#5C3D0C';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.7);
        ctx.lineTo(r * 0.7, r * 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r * 0.7, -r * 0.7);
        ctx.lineTo(-r * 0.7, r * 0.7);
        ctx.stroke();

        // Metal bands
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.5,  0, Math.PI * 2); ctx.stroke();

        // Owner color dot
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }
}


// ─── 4. ENERGY WAVE ─────────────────────────────────────────────
//  Wide wave that travels along the ground surface.
//  Light gravity keeps it snapped. Dies when it reaches a
//  platform edge (falls off).
// ─────────────────────────────────────────────────────────────────
class EnergyWave extends Projectile {
    constructor(opts) {
        const d = {
            type: 'wave',
            w: 60, h: 50,
            damage: 10, baseKB: 180, kbScaling: 0.8, angle: 35,
            lifetime: 150,
            gravity: 0.8,
            stageCollision: 'slide',
            groundSnap: true,
            piercing: false,
            trailLength: 6,
            shape: 'rect',
        };
        super({ ...d, ...opts, type: 'wave' });
        this._waveTime  = 0;
        this._edgeGrace = 0;
    }

    update(dt) {
        this._waveTime += dt * 10;
        const wasOnGround = this._onGround;
        this._onGround = false;

        super.update(dt);

        // Edge death grace period
        if (wasOnGround && !this._onGround) {
            this._edgeGrace++;
            if (this._edgeGrace > 15) this.kill();
        } else if (this._onGround) {
            this._edgeGrace = 0;
        }
    }

    _renderBody(ctx, cam) {
        const sx = cam.wtsx(this.x);
        const sy = cam.wtsy(this.y);
        const sw = this.w * cam.zoom;
        const sh = this.h * cam.zoom;
        const phase = this._waveTime;
        const segs  = 6;

        ctx.save();

        // Wave body polygon
        ctx.beginPath();
        ctx.moveTo(sx, sy + sh);
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const px = sx + t * sw;
            const waveY = Math.sin(phase + t * Math.PI * 2) * sh * 0.2;
            ctx.lineTo(px, sy + sh * 0.3 + waveY);
        }
        ctx.lineTo(sx + sw, sy + sh);
        ctx.closePath();

        // Gradient fill
        const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
        grad.addColorStop(0, this.color);
        grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(0,0,0,0.1)');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.8;
        ctx.fill();

        // Top bright edge
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const px = sx + t * sw;
            const waveY = Math.sin(phase + t * Math.PI * 2) * sh * 0.2;
            if (i === 0) ctx.moveTo(px, sy + sh * 0.3 + waveY);
            else ctx.lineTo(px, sy + sh * 0.3 + waveY);
        }
        ctx.stroke();

        // Ground sparks
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(sx + Math.random() * sw, sy + sh - Math.random() * 6, 3, 3);
        }

        ctx.restore();
    }
}


// ─── Explosion Effect (spawned by BlastProjectile on death) ──────
class ExplosionEffect extends StationaryProjectile {
    constructor(opts) {
        super({ ...opts, type: 'explosion' });
        this._isExplosion = true;
    }

    _renderBody(ctx, cam) {
        const sx = cam.wtsx(this.x) + this.w * cam.zoom / 2;
        const sy = cam.wtsy(this.y) + this.h * cam.zoom / 2;
        const progress = 1 - (this.lifetime / this.maxLifetime);
        const r = (this.w / 2) * cam.zoom * (0.5 + progress * 0.8);

        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - progress);
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, '#ff8800');
        grad.addColorStop(0.7, '#ff4400');
        grad.addColorStop(1, 'rgba(255,50,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.globalAlpha = Math.max(0, 0.9 * (1 - progress * 1.5));
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}


// =====================================================================
//  Factory map
// =====================================================================

const TYPE_MAP = {
    linear:     LinearProjectile,
    arc:        ArcProjectile,
    boomerang:  BoomerangProjectile,
    piercing:   PiercingProjectile,
    stationary: StationaryProjectile,
    laser:      LaserBeam,
    blast:      BlastProjectile,
    barrel:     BarrelProjectile,
    wave:       EnergyWave,
    explosion:  ExplosionEffect,
};


// =====================================================================
//  ProjectileManager
// =====================================================================

class ProjectileManager {
    constructor() {
        this.list       = [];
        this._spawnQueue = [];
    }

    /** Add a projectile to the active list. */
    spawn(proj) { this.list.push(proj); }

    /** Create a projectile by type key + opts and add it. */
    create(type, opts) {
        const Cls = TYPE_MAP[type] || LinearProjectile;
        const proj = new Cls(opts);
        this.spawn(proj);
        return proj;
    }

    /** Spawn from an AttackData definition on a fighter. */
    spawnFromAttack(fighter, atk) {
        if (!atk.spawnsProjectile) return;

        const sx = fighter.x + fighter.width / 2 + (atk.projSpawnX || 30) * fighter.facing;
        const sy = fighter.y + fighter.height / 2 + (atk.projSpawnY || 0);

        // Compute velocity (support angled launches)
        const speed = atk.projSpeed || 650;
        const launchAngle = (atk.projLaunchAngle || 0) * Math.PI / 180;
        const vx = Math.cos(launchAngle) * speed * fighter.facing;
        const vy = -Math.sin(launchAngle) * speed;

        const type = atk.projectileType || 'linear';
        const Cls  = TYPE_MAP[type] || LinearProjectile;

        this.spawn(new Cls({
            ownerPort:      fighter.port,
            x: sx, y: sy,
            vx, vy,
            w:              atk.projW || 22,
            h:              atk.projH || 22,
            radius:         atk.projR || Math.max(atk.projW || 22, atk.projH || 22) / 2,
            shape:          atk.projShape || 'circle',
            damage:         atk.projDamage   || atk.damage,
            baseKB:         atk.projKB       || 150,
            kbScaling:      atk.projKBScaling || atk.kbScaling || 0.7,
            angle:          atk.projAngle    || 30,
            lifetime:       atk.projLifetime || 100,
            gravity:        atk.projGravity  || 0,
            stageCollision: atk.projStageCollision || 'none',
            bounciness:     atk.projBounciness,
            maxBounces:     atk.projMaxBounces,
            piercing:       atk.projPiercing || false,
            maxHits:        atk.projMaxHits  || 0,
            trailLength:    atk.projTrail    || 0,
            color:          atk.projColor,
            groundSnap:     atk.projGroundSnap || false,
            explosionRadius: atk.projExplosionRadius,
            explosionDamage: atk.projExplosionDamage,
            explosionKB:     atk.projExplosionKB,
            explosionLife:   atk.projExplosionLife,
            gravScale:       atk.projGravity,
        }));
    }

    /**
     * Full per-frame update.
     * @param {number} dt — delta time
     * @param {Fighter[]} fighters — all fighters
     * @param {Stage} [stage] — for platform/blast zone collision
     */
    update(dt, fighters, stage) {
        this._spawnQueue.length = 0;

        // 1. Update each projectile, collide with stage + players
        for (const p of this.list) {
            p.update(dt);
            if (stage) p.collideStage(stage);
            p.checkHits(fighters);

            // Collect death-spawn effects (explosions)
            if (!p.alive && p.onDeathSpawn) {
                this._spawnQueue.push(p.onDeathSpawn);
                p.onDeathSpawn = null;
            }
        }

        // 2. Proj-vs-proj collision (opposing owners cancel)
        for (let i = 0; i < this.list.length; i++) {
            const a = this.list[i];
            if (!a.alive || a._isExplosion) continue;
            for (let j = i + 1; j < this.list.length; j++) {
                const b = this.list[j];
                if (!b.alive || b._isExplosion) continue;
                if (a.ownerPort === b.ownerPort) continue;

                const ca = a.getCenter(), cb = b.getCenter();
                if (Collision.circleCircle(ca.x, ca.y, a.getRadius(),
                                           cb.x, cb.y, b.getRadius())) {
                    if      (a.priority > b.priority) b.alive = false;
                    else if (b.priority > a.priority) a.alive = false;
                    else { a.alive = false; b.alive = false; }
                }
            }
        }

        // 3. Prune dead
        this.list = this.list.filter(p => p.alive);

        // 4. Process deferred spawns (explosions)
        for (const cfg of this._spawnQueue) {
            const Cls = cfg._isExplosion ? ExplosionEffect
                      : (TYPE_MAP[cfg.type] || StationaryProjectile);
            this.spawn(new Cls(cfg));
        }
    }

    render(ctx, cam) {
        for (const p of this.list) p.render(ctx, cam);
    }

    clear() { this.list.length = 0; }
}


// =====================================================================
//  Exports
// =====================================================================

SMASH.Projectile            = Projectile;
SMASH.LinearProjectile      = LinearProjectile;
SMASH.ArcProjectile         = ArcProjectile;
SMASH.BoomerangProjectile   = BoomerangProjectile;
SMASH.PiercingProjectile    = PiercingProjectile;
SMASH.StationaryProjectile  = StationaryProjectile;
SMASH.LaserBeam             = LaserBeam;
SMASH.BlastProjectile       = BlastProjectile;
SMASH.BarrelProjectile      = BarrelProjectile;
SMASH.EnergyWave            = EnergyWave;
SMASH.ExplosionEffect       = ExplosionEffect;
SMASH.ProjectileManager     = ProjectileManager;

})();
