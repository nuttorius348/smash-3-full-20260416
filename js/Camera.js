/**
 * Camera.js — Dynamic camera with distance-based zoom scaling.
 *
 * ══════════════════════════════════════════════════════════════════
 *  ZOOM FORMULA
 * ══════════════════════════════════════════════════════════════════
 *  span   = max player spread + PADDING * 2
 *  zoomX  = canvasW / span.x
 *  zoomY  = canvasH / span.y
 *  target = clamp(min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM)
 *
 *  As fighters spread apart the camera smoothly zooms out.
 *  As they cluster it zooms back in (up to MAX_ZOOM).
 *  Smooth interpolation via exponential lerp (LERP factor).
 *
 *  Camera can be optionally bounded by stage.cameraBounds to
 *  prevent scrolling past the edge of large maps.
 * ══════════════════════════════════════════════════════════════════
 */
(function() {
const S = SMASH.Settings;

class Camera {
    constructor() {
        this.x    = 0;      // world-space center focus x
        this.y    = 0;      // world-space center focus y
        this.zoom = 1;      // current zoom factor

        this._tx  = 0;      // target x
        this._ty  = 0;      // target y
        this._tz  = 1;      // target zoom
    }

    // ── Tuning constants ─────────────────────────────────────────
    static PADDING      = 250;     // extra space around player spread
    static MIN_ZOOM     = 0.22;    // furthest zoom-out (large maps)
    static MAX_ZOOM     = 1.15;    // closest zoom-in
    static DEFAULT_ZOOM = 0.7;     // zoom when only one player
    static LERP_POS     = 4.5;     // position smoothing speed
    static LERP_ZOOM    = 3.0;     // zoom smoothing speed
    static LEAD_FACTOR  = 0.08;    // look-ahead based on avg velocity

    update(fighters, stage, dt) {
        const alive = fighters.filter(f => f.stocks > 0);
        if (!alive.length) return;

        // ── Bounding box of all alive fighters ───────────────────
        let minX = Infinity,  maxX = -Infinity;
        let minY = Infinity,  maxY = -Infinity;
        let avgVx = 0, avgVy = 0;

        for (const f of alive) {
            const fx1 = f.x;
            const fx2 = f.x + f.width;
            const fy1 = f.y;
            const fy2 = f.y + f.height;
            if (fx1 < minX) minX = fx1;
            if (fx2 > maxX) maxX = fx2;
            if (fy1 < minY) minY = fy1;
            if (fy2 > maxY) maxY = fy2;
            avgVx += f.vx;
            avgVy += f.vy;
        }
        avgVx /= alive.length;
        avgVy /= alive.length;

        // ── Target position (center of bounding box + lead) ─────
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        this._tx = cx + avgVx * Camera.LEAD_FACTOR;
        this._ty = cy + avgVy * Camera.LEAD_FACTOR;

        // ── Target zoom (based on spread) ────────────────────────
        const spanX = (maxX - minX) + Camera.PADDING * 2;
        const spanY = (maxY - minY) + Camera.PADDING * 2;

        if (alive.length === 1) {
            // Single fighter: comfortable default zoom
            this._tz = Camera.DEFAULT_ZOOM;
        } else {
            const zx = S.W / Math.max(spanX, 1);
            const zy = S.H / Math.max(spanY, 1);
            this._tz = Math.max(Camera.MIN_ZOOM,
                       Math.min(Camera.MAX_ZOOM, Math.min(zx, zy)));
        }

        // ── Smooth interpolation ─────────────────────────────────
        const tPos  = Math.min(1, Camera.LERP_POS * dt);
        const tZoom = Math.min(1, Camera.LERP_ZOOM * dt);

        this.x    += (this._tx - this.x) * tPos;
        this.y    += (this._ty - this.y) * tPos;
        this.zoom += (this._tz - this.zoom) * tZoom;

        // ── Camera bounds (optional stage constraint) ────────────
        if (stage && stage.cameraBounds) {
            const b = stage.cameraBounds;
            // Compute the viewable world-space half-dimensions at current zoom
            const halfW = (S.W / 2) / this.zoom;
            const halfH = (S.H / 2) / this.zoom;

            // Clamp so the camera viewport doesn't show beyond bounds
            if (b.minX !== undefined) this.x = Math.max(b.minX + halfW, this.x);
            if (b.maxX !== undefined) this.x = Math.min(b.maxX - halfW, this.x);
            if (b.minY !== undefined) this.y = Math.max(b.minY + halfH, this.y);
            if (b.maxY !== undefined) this.y = Math.min(b.maxY - halfH, this.y);
        }
    }

    /** World → screen X */
    wtsx(wx) { return (wx - this.x) * this.zoom + S.W / 2; }
    /** World → screen Y */
    wtsy(wy) { return (wy - this.y) * this.zoom + S.H / 2; }

    /** Screen → world X */
    stwx(sx) { return (sx - S.W / 2) / this.zoom + this.x; }
    /** Screen → world Y */
    stwy(sy) { return (sy - S.H / 2) / this.zoom + this.y; }

    /** Get world-space viewport rect */
    getViewport() {
        const halfW = (S.W / 2) / this.zoom;
        const halfH = (S.H / 2) / this.zoom;
        return {
            x: this.x - halfW,
            y: this.y - halfH,
            w: halfW * 2,
            h: halfH * 2,
        };
    }
}

SMASH.Camera = Camera;
})();
