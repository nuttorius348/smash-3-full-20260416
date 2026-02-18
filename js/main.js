/**
 * main.js — Scene orchestrator / entry point.
 *
 * ══════════════════════════════════════════════════════════════════
 *  SCENE FLOW
 * ══════════════════════════════════════════════════════════════════
 *              ┌─────────────┐
 *              │  Main Menu  │ (HTML overlay)
 *              └──────┬──────┘
 *                     │ FIGHT!
 *              ┌──────▼──────┐
 *     ┌───────►│  Char Select│ (canvas scene)
 *     │        └──────┬──────┘
 *     │               │ all ready + Enter
 *     │        ┌──────▼──────┐
 *     │        │   Game Loop │ ⇄ Pause
 *     │        └──────┬──────┘
 *     │               │ game over
 *     │        ┌──────▼──────┐
 *     ├────────┤   Results   │ (overlay in Game.js)
 *     │        └──────┬──────┘
 *     │               │ Rematch / Char Select / Menu
 *     │               ▼
 *     └───────── routes back ─────────────────────►
 * ══════════════════════════════════════════════════════════════════
 */
(function () {

const canvas    = document.getElementById('gameCanvas');
const menuDiv   = document.getElementById('menu');
const startBtn  = document.getElementById('startBtn');

// ── Device manager for controller auto-detection ────────────────
const deviceMgr = new SMASH.DeviceManager();
let scanTimer   = null;

function startScan() {
    deviceMgr.scan();
    scanTimer = setInterval(() => {
        if (menuDiv.style.display !== 'none') deviceMgr.scan();
    }, 1000);
}

function stopScan() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
}

// ── Active scene tracking ───────────────────────────────────────
let activeScene      = null;
let lastMenuSettings = {};
let lastConfigs      = [];

// ═════════════════════════════════════════════════════════════════
//  SCENE TRANSITIONS
// ═════════════════════════════════════════════════════════════════

function stopActiveScene() {
    if (activeScene && activeScene.stop) activeScene.stop();
    activeScene = null;
}

/**
 * Show the HTML main menu overlay.
 */
function showMenu() {
    stopActiveScene();
    canvas.style.display  = 'none';
    menuDiv.style.display = 'flex';
    startScan();
}

/**
 * Show the interactive character-select canvas scene.
 * @param {object} settings — { stageKey, stocks, debug }
 */
function showCharSelect(settings) {
    stopActiveScene();
    stopScan();

    lastMenuSettings = settings || lastMenuSettings;
    menuDiv.style.display = 'none';
    canvas.style.display  = 'block';

    const scene = new SMASH.CharacterSelectScene(canvas, deviceMgr);

    scene.onStartMatch = (configs) => {
        activeScene = null;
        scene.stop();
        lastConfigs = configs;
        startGame(configs, lastMenuSettings);
    };

    scene.start();
    activeScene = scene;
}

/**
 * Create a Game instance and start the match.
 * @param {Array}  configs  — player configs from CharacterSelectScene
 * @param {object} settings — { stageKey, stocks, debug }
 */
function startGame(configs, settings) {
    stopActiveScene();
    canvas.style.display  = 'block';
    menuDiv.style.display = 'none';

    const game = new SMASH.Game(canvas, configs, {
        stageKey: settings.stageKey || 'battlefield',
        stocks:   settings.stocks   || 3,
        debug:    settings.debug    || false,
        onExit:   handleGameExit,
    });

    game.start();
    activeScene = game;
}

/**
 * Handle exit reasons from Game.js overlay menus.
 * @param {'menu'|'charSelect'} reason
 */
function handleGameExit(reason) {
    activeScene = null;

    switch (reason) {
        case 'charSelect':
            showCharSelect(lastMenuSettings);
            break;
        case 'menu':
        default:
            showMenu();
            break;
    }
}

// ═════════════════════════════════════════════════════════════════
//  MENU SETTINGS READER
// ═════════════════════════════════════════════════════════════════

function readMenuSettings() {
    return {
        stageKey: document.getElementById('stageSelect').value,
        stocks:   parseInt(document.getElementById('stockCount').value, 10) || 3,
        debug:    document.getElementById('debugToggle').checked,
    };
}

// ═════════════════════════════════════════════════════════════════
//  EVENT BINDINGS
// ═════════════════════════════════════════════════════════════════

// FIGHT button → character select
startBtn.addEventListener('click', () => {
    showCharSelect(readMenuSettings());
});

// Enter from menu
window.addEventListener('keydown', e => {
    if (menuDiv.style.display !== 'none' &&
        (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        showCharSelect(readMenuSettings());
    }
});

// Controller connect/disconnect
window.addEventListener('gamepadconnected',    () => deviceMgr.scan());
window.addEventListener('gamepaddisconnected', () => deviceMgr.scan());

// ── Boot ─────────────────────────────────────────────────────────
startScan();

})();
