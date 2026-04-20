/**
 * multiplayer-server.js — SMASH 3 LAN Multiplayer Server (2–4 players)
 *
 * Usage:  node server/multiplayer-server.js [port]
 * Default port: 7777
 */

const { WebSocketServer } = require('ws');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const PORT = parseInt(process.argv[2], 10) || 7777;
const MAX_PLAYERS = 4;

// ═════════════════════════════════════════════════════════════════
//  STATIC FILE SERVER
// ═════════════════════════════════════════════════════════════════
const GAME_ROOT = path.resolve(__dirname, '..');

const MIME = {
    '.html': 'text/html',  '.css': 'text/css',  '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.ttf': 'font/ttf', '.webp': 'image/webp', '.mp4': 'video/mp4',
    '.webm': 'video/webm',
};

const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434', 10);

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1024 * 1024) {
                reject(new Error('Body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve(text ? JSON.parse(text) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function extractActionFromText(text) {
    const fallback = { move_x: 0, move_y: 0, jump: false, attack: false, special: false, shield: false, grab: false };
    if (!text || typeof text !== 'string') return fallback;

    let cleaned = text.trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
        const obj = JSON.parse(cleaned);
        return {
            move_x: Number.isFinite(Number(obj.move_x)) ? Math.max(-1, Math.min(1, Number(obj.move_x))) : 0,
            move_y: Number.isFinite(Number(obj.move_y)) ? Math.max(-1, Math.min(1, Number(obj.move_y))) : 0,
            jump: !!obj.jump,
            attack: !!obj.attack,
            special: !!obj.special,
            shield: !!obj.shield,
            grab: !!obj.grab,
        };
    } catch {
        return fallback;
    }
}

function queryOllamaForAction(state, model) {
    return new Promise((resolve, reject) => {
        const prompt = `You are playing a smash-style platform fighter game.\n\nGame state:\n- Your position: ${JSON.stringify(state.ai_pos || null)}\n- Enemy position: ${JSON.stringify(state.enemy_pos || null)}\n- Your damage: ${state.ai_damage || 0}%\n- Enemy damage: ${state.enemy_damage || 0}%\n- Your stocks: ${state.ai_stocks || 0}\n- Enemy stocks: ${state.enemy_stocks || 0}\n- Stage bounds: ${JSON.stringify(state.stage_bounds || null)}\n- On ground: ${!!state.ai_grounded}\n- Enemy airborne: ${!!state.enemy_airborne}\n\nRespond ONLY with JSON: {"move_x":-1|0|1,"move_y":-1|0|1,"jump":true|false,"attack":true|false,"special":true|false,"shield":true|false,"grab":true|false}.`;

        const body = JSON.stringify({
            model: model || DEFAULT_OLLAMA_MODEL,
            prompt,
            stream: false,
            options: { temperature: 0.2 },
        });

        const req = http.request({
            hostname: OLLAMA_HOST,
            port: OLLAMA_PORT,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            timeout: 1800,
        }, (resp) => {
            const chunks = [];
            resp.on('data', (d) => chunks.push(d));
            resp.on('end', () => {
                try {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    const parsed = JSON.parse(raw);
                    const text = parsed && typeof parsed.response === 'string' ? parsed.response : '';
                    resolve(extractActionFromText(text));
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('timeout', () => req.destroy(new Error('Ollama timeout')));
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.startsWith('/api/ollama-action')) {
        try {
            const body = await readJsonBody(req);
            const model = (body && typeof body.model === 'string' && body.model.trim()) ? body.model.trim() : DEFAULT_OLLAMA_MODEL;
            const action = await queryOllamaForAction(body || {}, model);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, model, action }));
        } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: false,
                error: err && err.message ? err.message : 'ollama_error',
                action: { move_x: 0, move_y: 0, jump: false, attack: false, special: false, shield: false, grab: false },
            }));
        }
        return;
    }

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(GAME_ROOT, urlPath);
    if (!filePath.startsWith(GAME_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        const ext  = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

// ═════════════════════════════════════════════════════════════════
//  ROOM STATE  (up to 4 players)
// ═════════════════════════════════════════════════════════════════
const room = {
    players:    new Array(MAX_PLAYERS).fill(null),
    names:      new Array(MAX_PLAYERS).fill(''),
    chars:      new Array(MAX_PLAYERS).fill(null),
    charQueues: [[], [], [], []],
    teams:      new Array(MAX_PLAYERS).fill(-1),
    ready:      new Array(MAX_PLAYERS).fill(false),
    inMatch:    false,
    phase:      'setup',
    mode:       'stock',
    modeOpts:   {},
    mediaOpts:  {
        soundsEnabled: true,
        ultimateVideos: true,
    },
    stage:      'battlefield',
};

const tournament = {
    active: false,
    entrants: [],
    round: 0,
    roundSlots: [],
    pairs: [],
    pairIndex: 0,
    winners: [],
};

function slotOf(ws) {
    for (let i = 0; i < MAX_PLAYERS; i++) if (room.players[i] === ws) return i;
    return -1;
}
function send(ws, obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(obj, excludeSlot) {
    for (let i = 0; i < MAX_PLAYERS; i++) {
        if (i !== excludeSlot) send(room.players[i], obj);
    }
}
function connectedCount() {
    let n = 0;
    for (let i = 0; i < MAX_PLAYERS; i++) if (room.players[i]) n++;
    return n;
}
function resetLobby() {
    for (let i = 0; i < MAX_PLAYERS; i++) {
        room.chars[i] = null; room.teams[i] = -1; room.ready[i] = false;
        room.charQueues[i] = [];
    }
    room.inMatch = false;
}

function resetTournament() {
    tournament.active = false;
    tournament.entrants = [];
    tournament.round = 0;
    tournament.roundSlots = [];
    tournament.pairs = [];
    tournament.pairIndex = 0;
    tournament.winners = [];
}

function shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function makePairs(slots) {
    const pairs = [];
    for (let i = 0; i < slots.length; i += 2) {
        if (i + 1 < slots.length) pairs.push([slots[i], slots[i + 1]]);
        else pairs.push([slots[i], null]);
    }
    return pairs;
}

function launchTournamentPair() {
    if (!tournament.active) return;

    while (tournament.pairIndex < tournament.pairs.length) {
        const pair = tournament.pairs[tournament.pairIndex];
        if (!pair || pair[0] == null) {
            tournament.pairIndex++;
            continue;
        }
        // Bye into next round.
        if (pair[1] == null) {
            tournament.winners.push(pair[0]);
            tournament.pairIndex++;
            continue;
        }

        room.inMatch = true;
        const readySlots = [pair[0], pair[1]];
        broadcast({
            type: 'matchStart',
            seed: Math.floor(Math.random() * 999999),
            chars: [...room.chars],
            teams: [...room.teams],
            charQueues: room.charQueues.map(q => [...q]),
            stage: room.stage,
            mode: room.mode,
            modeOpts: room.modeOpts,
            mediaOpts: room.mediaOpts,
            playerCount: readySlots.length,
            readySlots,
            tournament: {
                active: true,
                round: tournament.round,
                matchIndex: tournament.pairIndex + 1,
                totalMatches: tournament.pairs.length,
                pair: readySlots,
                entrants: [...tournament.entrants],
            },
        });
        const cl = readySlots.map(i => `${room.names[i]}(${room.chars[i]})`).join(' vs ');
        console.log(`  [T] Round ${tournament.round} Match ${tournament.pairIndex + 1}: ${cl}`);
        return;
    }

    // Finished this round.
    if (tournament.winners.length <= 1) {
        const champ = tournament.winners[0] != null ? tournament.winners[0] : -1;
        broadcast({
            type: 'tournamentComplete',
            winner: champ,
            msg: champ >= 0
                ? `${room.names[champ] || `Player ${champ + 1}`} wins the tournament!`
                : 'Tournament complete.',
        });
        console.log(`  [T] Champion: ${champ >= 0 ? (room.names[champ] || `P${champ + 1}`) : 'Unknown'}`);
        resetTournament();
        resetLobby();
        room.phase = 'lobby';
        return;
    }

    tournament.roundSlots = [...tournament.winners];
    tournament.winners = [];
    tournament.pairs = makePairs(tournament.roundSlots);
    tournament.pairIndex = 0;
    tournament.round++;
    launchTournamentPair();
}

function startTournament(readySlots) {
    resetTournament();
    tournament.active = true;
    tournament.entrants = shuffle(readySlots);
    tournament.roundSlots = [...tournament.entrants];
    tournament.round = 1;
    tournament.pairs = makePairs(tournament.roundSlots);
    tournament.pairIndex = 0;
    tournament.winners = [];
    room.inMatch = false;

    const names = tournament.entrants.map(i => room.names[i] || `P${i + 1}`).join(', ');
    console.log(`  [T] Tournament started with ${readySlots.length} players: ${names}`);
    launchTournamentPair();
}

// ═════════════════════════════════════════════════════════════════
//  SERVER
// ═════════════════════════════════════════════════════════════════
const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║   SMASH 3 — Multiplayer Server       ║`);
    console.log(`  ║   Port: ${String(PORT).padEnd(28)}║`);
    console.log(`  ║   Max Players: ${MAX_PLAYERS}                    ║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal)
                console.log(`  → Other PC:  http://${net.address}:${PORT}`);
        }
    }
    console.log(`  → Local:     http://localhost:${PORT}\n`);
});

wss.on('connection', (ws) => {
    let slot = -1;
    for (let i = 0; i < MAX_PLAYERS; i++) { if (!room.players[i]) { slot = i; break; } }
    if (slot < 0) { send(ws, { type: 'error', msg: `Room full (${MAX_PLAYERS} max)` }); ws.close(); return; }

    room.players[slot] = ws;
    console.log(`  [+] P${slot + 1} connected (${connectedCount()}/${MAX_PLAYERS})`);

    send(ws, {
        type: 'welcome', slot, maxPlayers: MAX_PLAYERS,
        room: { names: [...room.names], chars: [...room.chars], teams: [...room.teams],
                charQueues: room.charQueues.map(q => [...q]),
                ready: [...room.ready], inMatch: room.inMatch, phase: room.phase,
                mode: room.mode, modeOpts: room.modeOpts, mediaOpts: room.mediaOpts, stage: room.stage },
    });
    broadcast({ type: 'playerJoined', slot, name: room.names[slot] }, slot);

    ws.on('message', (raw) => {
        let msg; try { msg = JSON.parse(raw); } catch { return; }
        const s = slotOf(ws); if (s < 0) return;

        switch (msg.type) {
            case 'join':
                room.names[s] = msg.name || `Player ${s + 1}`;
                broadcast({ type: 'playerJoined', slot: s, name: room.names[s] }, s);
                break;

            case 'charSelect':
                room.chars[s] = msg.char; room.ready[s] = false;
                broadcast({ type: 'charUpdate', slot: s, char: msg.char }, s);
                broadcast({ type: 'readyUpdate', slot: s, ready: false }, s);
                break;

            case 'teamSelect':
                room.teams[s] = msg.team != null ? msg.team : -1;
                broadcast({ type: 'teamUpdate', slot: s, team: room.teams[s] }, s);
                break;

            case 'ready':
                if (!room.chars[s]) { send(ws, { type: 'error', msg: 'Pick a character first' }); break; }
                room.ready[s] = true;
                broadcast({ type: 'readyUpdate', slot: s, ready: true }, s);
                break;

            case 'unready':
                room.ready[s] = false;
                broadcast({ type: 'readyUpdate', slot: s, ready: false }, s);
                break;

            case 'modeSelect':
                if (s !== 0) break;
                room.mode = msg.mode || 'stock';
                room.modeOpts = msg.modeOpts || {};
                broadcast({ type: 'modeUpdate', mode: room.mode, modeOpts: room.modeOpts });
                break;

            case 'stageSelect':
                if (s !== 0) break;
                room.stage = msg.stage || 'battlefield';
                broadcast({ type: 'stageUpdate', stage: room.stage });
                break;

            case 'mediaSelect':
                if (s !== 0) break;
                room.mediaOpts = {
                    soundsEnabled: !(msg.mediaOpts && msg.mediaOpts.soundsEnabled === false),
                    ultimateVideos: !(msg.mediaOpts && msg.mediaOpts.ultimateVideos === false),
                };
                broadcast({ type: 'mediaUpdate', mediaOpts: room.mediaOpts });
                break;

            case 'setupDone':
                if (s !== 0) break;
                room.phase = 'lobby';
                broadcast({ type: 'setupDone' });
                break;

            case 'draftSelect':
                room.charQueues[s] = msg.chars || [];
                room.chars[s] = (msg.chars && msg.chars.length > 0) ? msg.chars[0] : null;
                broadcast({ type: 'draftUpdate', slot: s, chars: room.charQueues[s] }, s);
                break;

            case 'start': {
                if (s !== 0) { send(ws, { type: 'error', msg: 'Only host can start' }); break; }
                const readySlots = [];
                for (let i = 0; i < MAX_PLAYERS; i++) {
                    if (room.players[i] && room.ready[i] && room.chars[i]) readySlots.push(i);
                }
                if (readySlots.length < 2) { send(ws, { type: 'error', msg: 'Need ≥2 ready players' }); break; }

                if (room.mode === 'tournament') {
                    startTournament(readySlots);
                    break;
                }

                room.inMatch = true;
                broadcast({
                    type: 'matchStart', seed: Math.floor(Math.random() * 999999),
                    chars: [...room.chars], teams: [...room.teams],
                    charQueues: room.charQueues.map(q => [...q]),
                    stage: room.stage, mode: room.mode, modeOpts: room.modeOpts, mediaOpts: room.mediaOpts,
                    playerCount: readySlots.length, readySlots,
                });
                const cl = readySlots.map(i => `${room.names[i]}(${room.chars[i]})`).join(' vs ');
                console.log(`  [!] Match (${room.mode}): ${cl}`);
                break;
            }

            case 'matchResult':
                if (s !== 0 || !tournament.active) break;
                if (!room.inMatch) break;
                if (tournament.pairIndex >= tournament.pairs.length) break;
                {
                    const pair = tournament.pairs[tournament.pairIndex];
                    const winner = pair.includes(msg.winner) ? msg.winner : pair[0];
                    room.inMatch = false;
                    tournament.winners.push(winner);
                    tournament.pairIndex++;
                    launchTournamentPair();
                }
                break;

            case 'input':
                // Guest → Host only
                if (s !== 0) send(room.players[0], { type: 'remoteInput', slot: s, input: msg.input });
                break;

            case 'gameState':
                // Host → all guests
                if (s === 0) {
                    for (let i = 1; i < MAX_PLAYERS; i++) send(room.players[i], { type: 'gameState', state: msg.state });
                }
                break;

            case 'rematch':
                room.inMatch = false; room.ready[s] = false;
                broadcast({ type: 'rematchRequest', slot: s }, s);
                break;

            case 'leave':
                handleDisconnect(s); ws.close(); break;
        }
    });

    ws.on('close', () => { const s = slotOf(ws); if (s >= 0) handleDisconnect(s); });
    ws.on('error', () => {});
});

function handleDisconnect(slot) {
    console.log(`  [-] P${slot + 1} disconnected (${connectedCount() - 1}/${MAX_PLAYERS})`);

    if (tournament.active) {
        resetTournament();
        resetLobby();
        room.phase = 'lobby';
        broadcast({ type: 'tournamentCancelled', msg: 'Tournament cancelled: a player disconnected.' });
    }

    room.players[slot] = null; room.names[slot] = '';
    room.chars[slot] = null; room.charQueues[slot] = []; room.teams[slot] = -1; room.ready[slot] = false;
    if (slot === 0) room.phase = 'setup';
    if (room.inMatch) room.inMatch = false;
    broadcast({ type: 'playerLeft', slot }, slot);
}

wss.on('error', (err) => { console.error('WebSocket error:', err); });
httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`\n  ERROR: Port ${PORT} in use. Try: node server/multiplayer-server.js ${PORT + 1}\n`);
    else console.error('Server error:', err);
    process.exit(1);
});
