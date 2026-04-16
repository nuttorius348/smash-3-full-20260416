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

const httpServer = http.createServer((req, res) => {
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
    stage:      'battlefield',
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
                mode: room.mode, modeOpts: room.modeOpts, stage: room.stage },
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
                room.inMatch = true;
                broadcast({
                    type: 'matchStart', seed: Math.floor(Math.random() * 999999),
                    chars: [...room.chars], teams: [...room.teams],
                    charQueues: room.charQueues.map(q => [...q]),
                    stage: room.stage, mode: room.mode, modeOpts: room.modeOpts,
                    playerCount: readySlots.length, readySlots,
                });
                const cl = readySlots.map(i => `${room.names[i]}(${room.chars[i]})`).join(' vs ');
                console.log(`  [!] Match (${room.mode}): ${cl}`);
                break;
            }

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
