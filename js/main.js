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

const canvas        = document.getElementById('gameCanvas');
const menuDiv       = document.getElementById('menu');
const startBtn      = document.getElementById('startBtn');
const galleryBtn    = document.getElementById('galleryBtn');
const tierListBtn   = document.getElementById('tierListBtn');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const controlsBtn   = document.getElementById('controlsBtn');
const controlsPanel = document.getElementById('controlsPanel');

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

function applyGlobalSoundSetting(enabled) {
    if (SMASH.SFX && SMASH.SFX.setEnabled) SMASH.SFX.setEnabled(enabled !== false);
    if (SMASH.Music && SMASH.Music.setEnabled) SMASH.Music.setEnabled(enabled !== false);
}

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
    if (controlsPanel) controlsPanel.classList.add('hidden');
    if (controlsBtn) controlsBtn.classList.remove('active');
    startScan();
    const soundsToggle = document.getElementById('soundsToggle');
    if (soundsToggle) applyGlobalSoundSetting(!!soundsToggle.checked);
    SMASH.Music.play('main');
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
    if (document.activeElement) document.activeElement.blur();

    const scene = new SMASH.CharacterSelectScene(canvas, deviceMgr, {
        gameMode: lastMenuSettings.gameMode || 'stock',
    });

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
    if (document.activeElement) document.activeElement.blur();

    SMASH.Music.play('battle');

    const game = new SMASH.Game(canvas, configs, {
        stageKey:   settings.stageKey   || 'battlefield',
        stocks:     settings.stocks     || 3,
        debug:      settings.debug      || false,
        gameMode:   settings.gameMode   || 'stock',
        staminaHP:  settings.staminaHP  || 150,
        ultimateVideos: settings.ultimateVideos !== false,
        onExit:     handleGameExit,
    });

    game.start();
    activeScene = game;
}

/**
 * Handle exit reasons from Game.js overlay menus.
 * @param {'menu'|'charSelect'} reason
 */
/**
 * Show the Ultimate Gallery screen to watch all ultimate videos.
 */
function showUltimateGallery() {
    stopActiveScene();
    stopScan();
    menuDiv.style.display = 'none';
    canvas.style.display  = 'block';
    if (document.activeElement) document.activeElement.blur();

    const scene = new SMASH.UltimateGalleryScene(canvas, () => {
        activeScene = null;
        showMenu();
    });
    scene.start();
    activeScene = scene;
}

/**
 * Show the in-game sprite tier list scene.
 */
function showTierList() {
    stopActiveScene();
    stopScan();
    menuDiv.style.display = 'none';
    canvas.style.display  = 'block';
    if (document.activeElement) document.activeElement.blur();

    const scene = new SMASH.TierListScene(canvas, () => {
        activeScene = null;
        showMenu();
    });
    scene.start();
    activeScene = scene;
}

/**
 * Start the Draft mode flow.
 * @param {object} settings
 */
function showDraft(settings) {
    stopActiveScene();
    stopScan();
    lastMenuSettings = settings || lastMenuSettings;
    menuDiv.style.display = 'none';
    canvas.style.display  = 'block';
    if (document.activeElement) document.activeElement.blur();

    const draftControlMode = (lastMenuSettings && lastMenuSettings.draftControlMode) || 'pvai';
    const isCoachDraft = draftControlMode === 'coach';
    const isPlayerDraftsBoth = draftControlMode === 'player_all';

    const scene = new SMASH.DraftScene(canvas, deviceMgr, {
        p1Config: { type: 'human' },
        p2Config: (isCoachDraft || isPlayerDraftsBoth) ? { type: 'human' } : { type: 'ai', level: 5 },
        stageKey: lastMenuSettings.stageKey || 'battlefield',
        onDone: (p1Queue, p2Queue, p1Cfg, p2Cfg) => {
            activeScene = null;
            startDraftGame(p1Queue, p2Queue, p1Cfg, p2Cfg, lastMenuSettings);
        },
        onBack: () => {
            activeScene = null;
            showMenu();
        },
    });

    scene.start();
    activeScene = scene;
}

/**
 * Launch a draft-mode Game with the drafted character queues.
 */
function startDraftGame(p1Queue, p2Queue, p1Cfg, p2Cfg, settings) {
    stopActiveScene();
    canvas.style.display  = 'block';
    menuDiv.style.display = 'none';
    if (document.activeElement) document.activeElement.blur();

    const forceAIVsAI = settings && settings.draftControlMode === 'coach';
    const forceP2AI = settings && settings.draftControlMode === 'player_all';

    // Build player configs — each player starts with their first drafted char
    const configs = [
        {
            port: 0,
            character: p1Queue[0],
            type: (forceAIVsAI || p1Cfg.type === 'ai') ? 'ai' : undefined,
            level: p1Cfg.level || 5,
            team: -1,
            ...((forceAIVsAI || p1Cfg.type === 'ai') ? {} : { deviceConfig: { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: 'wasd' } }),
        },
        {
            port: 1,
            character: p2Queue[0],
            type: (forceAIVsAI || forceP2AI || p2Cfg.type === 'ai') ? 'ai' : undefined,
            level: p2Cfg.level || 5,
            team: -1,
            ...((forceAIVsAI || forceP2AI || p2Cfg.type === 'ai') ? {} : { deviceConfig: { type: SMASH.CONTROLLER_TYPES.KEYBOARD, layout: 'arrows' } }),
        },
    ];

    SMASH.Music.play('battle');

    const game = new SMASH.Game(canvas, configs, {
        stageKey:   settings.stageKey || 'battlefield',
        stocks:     1,     // each character = 1 stock
        debug:      settings.debug || false,
        gameMode:   'draft',
        ultimateVideos: settings.ultimateVideos !== false,
        onExit:     handleGameExit,
    });

    // Set draft queues (skip first character since it's already loaded)
    game.setDraftQueues(p1Queue.slice(1), p2Queue.slice(1));
    game.start();
    activeScene = game;
}

/**
 * Start the Tournament mode flow.
 * @param {object} settings
 */
function showTournament(settings) {
    stopActiveScene();
    stopScan();
    lastMenuSettings = settings || lastMenuSettings;
    menuDiv.style.display = 'none';
    canvas.style.display  = 'block';
    if (document.activeElement) document.activeElement.blur();

    const scene = new SMASH.TournamentScene(canvas, {
        stageKey: lastMenuSettings.stageKey || 'battlefield',
        ultimateVideos: lastMenuSettings.ultimateVideos !== false,
        deviceMgr: deviceMgr,
        onDone: () => {
            activeScene = null;
            showMenu();
        },
        onBack: () => {
            activeScene = null;
            showMenu();
        },
    });

    scene.start();
    activeScene = scene;
}

/**
 * Start the Multiplayer flow.
 */
function showMultiplayer(settings) {
    stopActiveScene();
    stopScan();
    menuDiv.style.display = 'none';
    canvas.style.display  = 'block';
    if (document.activeElement) document.activeElement.blur();
    applyGlobalSoundSetting(!settings || settings.soundsEnabled !== false);
    SMASH.Music.play('multiplayer');

    const scene = new SMASH.MultiplayerScene(canvas, {
        deviceMgr: deviceMgr,
        soundsEnabled: !settings || settings.soundsEnabled !== false,
        ultimateVideos: !settings || settings.ultimateVideos !== false,
        onBack: () => {
            activeScene = null;
            showMenu();
        },
    });

    scene.start();
    activeScene = scene;
}

/**
 * Route to the correct scene based on game mode.
 */
function launchGameMode(settings) {
    switch (settings.gameMode) {
        case 'draft':
            showDraft(settings);
            break;
        case 'tournament':
            showTournament(settings);
            break;
        default:
            showCharSelect(settings);
            break;
    }
}

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
        gameMode:  document.getElementById('gameModeSelect').value,
        draftControlMode: document.getElementById('draftControlMode') ? document.getElementById('draftControlMode').value : 'pvai',
        stageKey:  document.getElementById('stageSelect').value,
        stocks:    parseInt(document.getElementById('stockCount').value, 10) || 3,
        staminaHP: parseInt(document.getElementById('staminaHP').value, 10) || 150,
        debug:     document.getElementById('debugToggle').checked,
        ultimateVideos: document.getElementById('ultimateVideosToggle').checked,
        soundsEnabled: document.getElementById('soundsToggle').checked,
    };
}

// ═════════════════════════════════════════════════════════════════
//  EVENT BINDINGS
// ═════════════════════════════════════════════════════════════════

// FIGHT button → mode-dependent scene
startBtn.addEventListener('click', () => {
    launchGameMode(readMenuSettings());
});

// GALLERY button → ultimate gallery
galleryBtn.addEventListener('click', () => {
    showUltimateGallery();
});

// TIER LIST button → in-game tier list scene
tierListBtn.addEventListener('click', () => {
    showTierList();
});

// MULTIPLAYER button
multiplayerBtn.addEventListener('click', () => {
    showMultiplayer(readMenuSettings());
});

// CONTROLS button
if (controlsBtn && controlsPanel) {
    controlsBtn.addEventListener('click', () => {
        const isHidden = controlsPanel.classList.contains('hidden');
        controlsPanel.classList.toggle('hidden', !isHidden);
        controlsBtn.classList.toggle('active', isHidden);
    });
}

// Enter from menu
window.addEventListener('keydown', e => {
    if (menuDiv.style.display !== 'none' &&
        (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        launchGameMode(readMenuSettings());
    }
});

const gameModeSelect = document.getElementById('gameModeSelect');
const draftModeRow = document.getElementById('draftModeRow');
if (gameModeSelect && draftModeRow) {
    const syncDraftControls = () => {
        draftModeRow.style.display = gameModeSelect.value === 'draft' ? 'inline-flex' : 'none';
    };
    gameModeSelect.addEventListener('change', syncDraftControls);
    syncDraftControls();
}

// Controller connect/disconnect
window.addEventListener('gamepadconnected',    () => deviceMgr.scan());
window.addEventListener('gamepaddisconnected', () => deviceMgr.scan());

// ── Boot ─────────────────────────────────────────────────────────
SMASH.Music.play('main');
startScan();

// Browsers block autoplay until first user gesture — retry main theme
document.addEventListener('click', function _firstGesture() {
    SMASH.Music.play('main');
    document.removeEventListener('click', _firstGesture);
}, { once: true });

})();
