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
const selfPlayBtn   = document.getElementById('selfPlayBtn');
const galleryBtn    = document.getElementById('galleryBtn');
const tierListBtn   = document.getElementById('tierListBtn');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const controlsBtn   = document.getElementById('controlsBtn');
const controlsPanel = document.getElementById('controlsPanel');
const menuContent   = document.getElementById('menuContent');
const introOverlay  = document.getElementById('introOverlay');
const introVideo    = document.getElementById('introVideo');
const introBtn      = document.getElementById('introBtn');
const continueDungeonBtn = document.getElementById('continueDungeonBtn');

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
let introActive      = false;
let introReturnToMenu = true;
let introNeedsGestureAudio = false;

const DUNGEON_SAVE_KEY = 'smash3_dungeon_save_v1';

function hasDungeonSave() {
    if (SMASH.Dungeon && typeof SMASH.Dungeon.hasSave === 'function') {
        return SMASH.Dungeon.hasSave();
    }
    try {
        return !!localStorage.getItem(DUNGEON_SAVE_KEY);
    } catch (err) {
        return false;
    }
}

function syncDungeonContinueButton() {
    if (!continueDungeonBtn) return;
    const hasSave = hasDungeonSave();
    continueDungeonBtn.disabled = !hasSave;
    continueDungeonBtn.style.display = hasSave ? '' : 'none';
}

function applyGlobalSoundSetting(enabled) {
    if (SMASH.SFX && SMASH.SFX.setEnabled) SMASH.SFX.setEnabled(enabled !== false);
    if (SMASH.Music && SMASH.Music.setEnabled) SMASH.Music.setEnabled(enabled !== false);
}

function fitMenuToViewport() {
    if (!menuDiv || !menuContent) return;
    if (menuDiv.style.display === 'none') return;

    menuContent.style.transform = 'scale(1)';

    const menuStyles = window.getComputedStyle(menuDiv);
    const padTop = parseFloat(menuStyles.paddingTop) || 0;
    const padBottom = parseFloat(menuStyles.paddingBottom) || 0;
    const availableHeight = Math.max(240, window.innerHeight - padTop - padBottom - 4);

    const naturalHeight = menuContent.scrollHeight || menuContent.offsetHeight || 1;
    const scale = Math.min(1, availableHeight / naturalHeight);
    menuContent.style.transform = `scale(${scale.toFixed(4)})`;
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
    requestAnimationFrame(fitMenuToViewport);
    startScan();
    const soundsToggle = document.getElementById('soundsToggle');
    if (soundsToggle) applyGlobalSoundSetting(!!soundsToggle.checked);
    SMASH.Music.play('main');
    syncDungeonContinueButton();
}

function showIntro(options) {
    const opts = options || {};
    introReturnToMenu = opts.returnToMenu !== false;
    introNeedsGestureAudio = false;

    stopActiveScene();
    stopScan();
    SMASH.Music.stop();
    canvas.style.display  = 'none';
    menuDiv.style.display = 'none';
    if (controlsPanel) controlsPanel.classList.add('hidden');
    if (controlsBtn) controlsBtn.classList.remove('active');

    if (!introOverlay || !introVideo) {
        if (introReturnToMenu) showMenu();
        return;
    }

    introActive = true;
    introOverlay.classList.remove('hidden');
    introOverlay.setAttribute('aria-hidden', 'false');
    introVideo.pause();
    introVideo.currentTime = 0;
    introVideo.muted = false;
    introVideo.playsInline = true;
    const playPromise = introVideo.play();
    if (playPromise && playPromise.catch) {
        playPromise.catch(() => {
            introVideo.muted = true;
            introNeedsGestureAudio = true;
            const retryPromise = introVideo.play();
            if (retryPromise && retryPromise.catch) {
                retryPromise.catch(() => {
                    // Autoplay can still be blocked; user can press Enter to skip.
                });
            }
        });
    }
}

function endIntro() {
    if (!introActive) return;
    introActive = false;

    if (introVideo) introVideo.pause();
    if (introOverlay) {
        introOverlay.classList.add('hidden');
        introOverlay.setAttribute('aria-hidden', 'true');
    }

    if (introReturnToMenu) showMenu();
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
 * Launch direct dual-agent self-play training.
 * Both P1 and P2 are AI slots and are later replaced by Q-learning controllers.
 * @param {object} settings
 */
function startDualSelfPlayTraining(settings) {
    stopActiveScene();
    stopScan();

    lastMenuSettings = settings || lastMenuSettings;

    canvas.style.display  = 'block';
    menuDiv.style.display = 'none';
    if (document.activeElement) document.activeElement.blur();

    SMASH.Music.play('battle');

    const configs = [
        {
            port: 0,
            character: 'brawler',
            type: 'ai',
            level: 6,
            team: -1,
        },
        {
            port: 1,
            character: 'brawler',
            type: 'ai',
            level: 6,
            team: -1,
        },
    ];

    const game = new SMASH.Game(canvas, configs, {
        stageKey:   lastMenuSettings.stageKey   || 'battlefield',
        stocks:     lastMenuSettings.stocks     || 3,
        debug:      lastMenuSettings.debug      || false,
        gameMode:   lastMenuSettings.gameMode === 'stamina' ? 'stamina' : 'stock',
        staminaHP:  lastMenuSettings.staminaHP  || 150,
        ultimateVideos: lastMenuSettings.ultimateVideos !== false,
        soundsEnabled: lastMenuSettings.soundsEnabled !== false,
        qLearningMode: 'dual-self-play',
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
 * Start Dungeon mode (single-player).
 * @param {object} settings
 * @param {object} options
 */
function showDungeon(settings, options) {
    stopActiveScene();
    stopScan();
    lastMenuSettings = settings || lastMenuSettings;
    menuDiv.style.display = 'none';
    canvas.style.display  = 'block';
    if (document.activeElement) document.activeElement.blur();

    SMASH.Music.play('battle');

    const scene = new SMASH.DungeonScene(canvas, {
        deviceMgr: deviceMgr,
        soundsEnabled: lastMenuSettings.soundsEnabled !== false,
        ultimateVideos: lastMenuSettings.ultimateVideos !== false,
        resume: !!(options && options.resume),
        onBack: () => {
            activeScene = null;
            showMenu();
        },
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
        case 'dungeon':
            showDungeon(settings, { resume: false });
            break;
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

// FIGHT button → original mode-dependent game launch
if (startBtn) {
    startBtn.addEventListener('click', () => {
        launchGameMode(readMenuSettings());
    });
}

// DOUBLE AI TRAINING button → dual self-play training launch
if (selfPlayBtn) {
    selfPlayBtn.addEventListener('click', () => {
        startDualSelfPlayTraining(readMenuSettings());
    });
}

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

// INTRO button → replay trailer
if (introBtn) {
    introBtn.addEventListener('click', () => {
        showIntro({ returnToMenu: true });
    });
}

if (continueDungeonBtn) {
    continueDungeonBtn.addEventListener('click', () => {
        showDungeon(readMenuSettings(), { resume: true });
    });
}

// CONTROLS button
if (controlsBtn && controlsPanel) {
    controlsBtn.addEventListener('click', () => {
        const isHidden = controlsPanel.classList.contains('hidden');
        controlsPanel.classList.toggle('hidden', !isHidden);
        controlsBtn.classList.toggle('active', isHidden);
        requestAnimationFrame(fitMenuToViewport);
        syncDungeonContinueButton();

        if (SMASH.preloadGifs) {
            SMASH.preloadGifs([
                'assets/UltraLazer_sprite neutral.gif',
                'assets/UltraLazer_sprite side.gif',
                'assets/UltraLazer_sprite down.gif',
                'assets/UltraLazer_sprite up.gif',
                'assets/SuperPerfectCell_sprite neutral charge.gif',
                'assets/SuperPerfectCell_sprite side.gif',
                'assets/SuperPerfectCell_sprite down.gif',
                'assets/SuperPerfectCell_sprite up.gif',
            ]);
        }
    });
}

// Note: global Enter-to-start is intentionally disabled.
// Some systems/controllers emit phantom Enter events and could auto-launch matches.
document.addEventListener('keydown', (e) => {
    if (!introActive) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        endIntro();
    }
});

document.addEventListener('click', () => {
    if (!introActive || !introNeedsGestureAudio || !introVideo) return;
    introNeedsGestureAudio = false;
    introVideo.muted = false;
    const p = introVideo.play();
    if (p && p.catch) p.catch(() => {});
});

document.addEventListener('keydown', () => {
    if (!introActive || !introNeedsGestureAudio || !introVideo) return;
    introNeedsGestureAudio = false;
    introVideo.muted = false;
    const p = introVideo.play();
    if (p && p.catch) p.catch(() => {});
});

if (introVideo) {
    introVideo.addEventListener('ended', () => {
        endIntro();
    });
}

const gameModeSelect = document.getElementById('gameModeSelect');
const draftModeRow = document.getElementById('draftModeRow');
if (gameModeSelect && draftModeRow) {
    const syncDraftControls = () => {
        draftModeRow.style.display = gameModeSelect.value === 'draft' ? 'inline-flex' : 'none';
        requestAnimationFrame(fitMenuToViewport);
    };
    gameModeSelect.addEventListener('change', syncDraftControls);
    syncDraftControls();
}

window.addEventListener('resize', () => {
    requestAnimationFrame(fitMenuToViewport);
});

// Controller connect/disconnect
window.addEventListener('gamepadconnected',    () => deviceMgr.scan());
window.addEventListener('gamepaddisconnected', () => deviceMgr.scan());

// ── Boot ─────────────────────────────────────────────────────────
showIntro({ returnToMenu: true });

// Browsers block autoplay until first user gesture — retry main theme
document.addEventListener('click', function _firstGesture() {
    SMASH.Music.play('main');
    document.removeEventListener('click', _firstGesture);
}, { once: true });

})();
