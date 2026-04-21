(function () {
"use strict";

if (!window.SMASH) return;

const ACTIONS = {
    MOVE_LEFT: 0,
    MOVE_RIGHT: 1,
    JUMP: 2,
    ATTACK: 3,
    DODGE: 4,
    IDLE: 5,
};

const ACTION_NAMES = [
    "move left",
    "move right",
    "jump",
    "attack",
    "dodge",
    "idle",
];

const LEGACY_STORAGE_KEY = "smash3_qagent_weights_v1";
const STORAGE_KEYS = {
    p1: "smash3_qagent_p1_weights_v2",
    p2: "smash3_qagent_p2_weights_v2",
    combined: "smash3_qagent_combined_weights_v2",
};
const EXPORT_FILENAMES = {
    p1: "smash3-qagent-p1-weights.json",
    p2: "smash3-qagent-p2-weights.json",
    combined: "smash3-qagent-combined-weights.json",
};

const DUAL_SELFPLAY_EPSILON_FLOOR = 0.45;
const DUAL_KNOWLEDGE_SHARE_BLEND = 0.06;
const LEARNED_AI_EVAL_EPSILON = 0.05;
const DUAL_ROUND_RETRAIN_BATCHES = 96;
const DUAL_ARCHIVE_STORAGE_KEY = "smash3_qagent_archive_v1";
const DUAL_ARCHIVE_MAX_SNAPSHOTS = 20;
const DUAL_ARCHIVE_PUSH_INTERVAL = 2;
const DUAL_ARCHIVE_MIX_CHANCE = 0.55;
const DUAL_ARCHIVE_MIX_FACTOR = 0.40;
const DUAL_RANDOMIZE_MATCHUP_CHANCE = 1.00;
const DUAL_RANDOMIZE_STAGE_CHANCE = 0.55;
const DUAL_CURRICULUM_WARMUP_ROUNDS = 1200;
const DUAL_WARMUP_MATCHUP_SCALE_START = 0.30;
const DUAL_WARMUP_STAGE_SCALE_START = 0.20;
const DUAL_WARMUP_ARCHIVE_MIX_SCALE_START = 0.10;
const DUAL_WARMUP_ARCHIVE_FACTOR_SCALE_START = 0.35;
const EPSILON_OVERRIDE_TARGET = 0.03;

const REWARD_CFG = {
    stayOnMap: 0.18,
    offMap: -4.50,
    damageToEnemy: 2.80,
    damageTaken: -1.45,
    closeCombatBonus: 0.45,
    distancePenalty: -0.95,
    attackIntentBonus: 2.35,
    idlePenalty: -0.85,
    moveTowardBonus: 1.35,
    moveAwayPenalty: -1.85,
    combatHitBonus: 2.50,
    combatStallTickPenalty: -0.02,
    combatStallMaxPenalty: -1.60,
    farWhiffPenalty: -0.80,
    edgeDangerPenalty: -0.60,
    edgeCenteringBonus: 0.70,
    edgeJumpRiskPenalty: -0.85,
    selfStockBase: -500,
    selfStockThrownAdjustment: 170,
    selfStockSelfDestructAdjustment: -1400,
    selfStockBankPenaltyRatio: 0.90,
    selfDestructBankPenaltyRatio: 1.40,
    noCombatRoundPenalty: -130,
    lowPressureRoundPenalty: -55,
    selfDestructRoundPenalty: -240,
    enemyFall: 120,
    winRound: 260,
    loseRound: -420,
};

function clamp01(v) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function normRange(v, min, max) {
    if (!Number.isFinite(v)) return 0;
    if (max <= min) return 0.5;
    return clamp01((v - min) / (max - min));
}

function normSigned(v, maxAbs) {
    if (!Number.isFinite(v) || maxAbs <= 0) return 0.5;
    return clamp01((v + maxAbs) / (maxAbs * 2));
}

function teamEnemyCheck(me, other) {
    if (!me || !other || me === other) return false;
    if (!other.isAlive) return false;

    const mt = me.team;
    const ot = other.team;
    if (mt >= 0 && ot >= 0) return mt !== ot;

    return true;
}

class QAgent {
    constructor(options) {
        const opts = options || {};
        this.id = String(opts.id || "P2");
        this.storageKey = String(opts.storageKey || LEGACY_STORAGE_KEY);
        this.fallbackStorageKey = opts.fallbackStorageKey ? String(opts.fallbackStorageKey) : null;
        this.exportFilename = String(opts.exportFilename || EXPORT_FILENAMES.p2);

        this.stateSize = 8;
        this.actionSize = 6;

        this.gamma = 0.95;
        this.epsilon = 1.0;
        this.epsilonDecay = 0.996;
        this.epsilonMin = 0.12;
        this.epsilonMax = 1.0;
        this.epsilonStepDecay = 0.999995;

        this.maxMemory = 4000;
        this.batchSize = 32;

        this.memory = [];
        this.lastInferenceMs = 0;
        this.lastLoss = 0;
        this.lastOnlineLoss = 0;
        this.lastRetrainLoss = 0;
        this.totalTrainBatches = 0;
        this.lastSavedAt = 0;
        this._replayBusy = false;
        this._onlineTrainBusy = false;
        this._retrainBusy = false;
        this._pendingRoundRetrains = 0;

        this.model = this._buildModel();

        this._loadFromLocalStorageSafe();
        this._warmModel();

        this._saveHandle = setInterval(() => {
            this.saveToLocalStorage();
        }, 60000);

        window.addEventListener("beforeunload", () => {
            this.saveToLocalStorage();
        });
    }

    _buildModel() {
        if (!window.tf) {
            throw new Error("TensorFlow.js was not found. Ensure tf.min.js is loaded first.");
        }

        const model = tf.sequential();
        model.add(tf.layers.dense({ inputShape: [8], units: 24, activation: "relu" }));
        model.add(tf.layers.dense({ units: 24, activation: "relu" }));
        model.add(tf.layers.dense({ units: 6, activation: "linear" }));
        model.compile({ optimizer: tf.train.adam(0.001), loss: "meanSquaredError" });
        return model;
    }

    _warmModel() {
        try {
            tf.tidy(() => {
                const out = this.model.predict(tf.zeros([1, this.stateSize]));
                out.dataSync();
            });
        } catch (_) {
            // Warmup is best-effort only.
        }
    }

    _decayEpsilonStep(stepWeight) {
        const weight = Number.isFinite(stepWeight) ? Math.max(0, stepWeight) : 0;
        if (weight <= 0) return;

        const factor = Math.pow(this.epsilonStepDecay, weight);
        const next = this.epsilon * factor;
        this.epsilon = Math.max(this.epsilonMin, Math.min(this.epsilonMax, next));
    }

    act(stateVector) {
        if (!Array.isArray(stateVector) || stateVector.length !== this.stateSize) {
            return ACTIONS.IDLE;
        }

        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.actionSize);
        }

        try {
            const t0 = performance.now();

            const bestAction = tf.tidy(() => {
                const state = tf.tensor2d(stateVector, [1, this.stateSize]);
                const qValues = this.model.predict(state);
                const data = qValues.dataSync();

                let bestIdx = 0;
                let bestVal = data[0];
                for (let i = 1; i < data.length; i++) {
                    if (data[i] > bestVal) {
                        bestVal = data[i];
                        bestIdx = i;
                    }
                }
                return bestIdx;
            });

            this.lastInferenceMs = performance.now() - t0;
            return bestAction;
        } catch (err) {
            console.warn("QAgent act failed; using idle action.", err);
            return ACTIONS.IDLE;
        }
    }

    remember(state, action, reward, nextState, done) {
        if (!Array.isArray(state) || !Array.isArray(nextState)) return;

        this.memory.push({
            state: state.slice(0, this.stateSize),
            action: action | 0,
            reward: Number(reward) || 0,
            nextState: nextState.slice(0, this.stateSize),
            done: !!done,
        });

        if (this.memory.length > this.maxMemory) {
            this.memory.shift();
        }
    }

    trainImmediate(state, action, reward, nextState, done) {
        if (this._onlineTrainBusy) return;
        if (!Array.isArray(state) || state.length !== this.stateSize) return;
        if (!Array.isArray(nextState) || nextState.length !== this.stateSize) return;

        const statesTensor = tf.tensor2d(state, [1, this.stateSize]);
        const nextStatesTensor = tf.tensor2d(nextState, [1, this.stateSize]);

        const qCurrTensor = this.model.predict(statesTensor);
        const qNextTensor = this.model.predict(nextStatesTensor);

        const qCurr = qCurrTensor.dataSync();
        const qNext = qNextTensor.dataSync();

        let maxNext = qNext[0];
        for (let a = 1; a < this.actionSize; a++) {
            const v = qNext[a];
            if (v > maxNext) maxNext = v;
        }

        const target = done ? reward : reward + this.gamma * maxNext;
        const out = new Float32Array(qCurr.length);
        out.set(qCurr);
        out[action | 0] = target;
        const targetTensor = tf.tensor2d(out, [1, this.actionSize]);

        qCurrTensor.dispose();
        qNextTensor.dispose();
        nextStatesTensor.dispose();

        this._onlineTrainBusy = true;
        Promise.resolve(this.model.trainOnBatch(statesTensor, targetTensor))
            .then((lossValue) => {
                const lossNum = Array.isArray(lossValue)
                    ? Number(lossValue[0])
                    : Number(lossValue);
                if (Number.isFinite(lossNum)) {
                    this.lastOnlineLoss = lossNum;
                    this.totalTrainBatches += 1;
                    this._decayEpsilonStep(1);
                }
            })
            .catch((err) => {
                console.warn("QAgent online train error:", err);
            })
            .finally(() => {
                statesTensor.dispose();
                targetTensor.dispose();
                this._onlineTrainBusy = false;
            });
    }

    replay() {
        if (this._replayBusy || this._retrainBusy) return;
        if (this.memory.length < this.batchSize) return;

        this._replayBusy = true;
        this._trainReplayBatchAsync("replay")
            .catch((err) => {
                console.warn("QAgent replay error:", err);
            })
            .finally(() => {
                this._replayBusy = false;
            });
    }

    _buildReplayBatchTensors() {
        if (this.memory.length < this.batchSize) return null;

        const n = this.batchSize;
        const batch = [];
        for (let i = 0; i < n; i++) {
            batch.push(this.memory[(Math.random() * this.memory.length) | 0]);
        }

        const statesBuf = new Float32Array(n * this.stateSize);
        const nextStatesBuf = new Float32Array(n * this.stateSize);

        for (let i = 0; i < n; i++) {
            const row = batch[i];
            for (let j = 0; j < this.stateSize; j++) {
                statesBuf[i * this.stateSize + j] = row.state[j] || 0;
                nextStatesBuf[i * this.stateSize + j] = row.nextState[j] || 0;
            }
        }

        const statesTensor = tf.tensor2d(statesBuf, [n, this.stateSize]);
        const nextStatesTensor = tf.tensor2d(nextStatesBuf, [n, this.stateSize]);
        const qCurrTensor = this.model.predict(statesTensor);
        const qNextTensor = this.model.predict(nextStatesTensor);

        const qCurr = qCurrTensor.dataSync();
        const qNext = qNextTensor.dataSync();
        const targets = new Float32Array(qCurr.length);
        targets.set(qCurr);

        for (let i = 0; i < n; i++) {
            const exp = batch[i];
            const nextOffset = i * this.actionSize;
            let maxNext = qNext[nextOffset];
            for (let a = 1; a < this.actionSize; a++) {
                const v = qNext[nextOffset + a];
                if (v > maxNext) maxNext = v;
            }
            const target = exp.done ? exp.reward : exp.reward + this.gamma * maxNext;
            targets[i * this.actionSize + exp.action] = target;
        }

        const targetTensor = tf.tensor2d(targets, [n, this.actionSize]);

        qCurrTensor.dispose();
        qNextTensor.dispose();
        nextStatesTensor.dispose();

        return { statesTensor, targetTensor };
    }

    async _trainReplayBatchAsync(lossKey) {
        const batch = this._buildReplayBatchTensors();
        if (!batch) return false;

        const { statesTensor, targetTensor } = batch;
        try {
            const lossValue = await Promise.resolve(this.model.trainOnBatch(statesTensor, targetTensor));
            const lossNum = Array.isArray(lossValue) ? Number(lossValue[0]) : Number(lossValue);
            if (!Number.isFinite(lossNum)) {
                return false;
            }

            if (lossKey === "retrain") this.lastRetrainLoss = lossNum;
            else this.lastLoss = lossNum;

            this.totalTrainBatches += 1;
            this._decayEpsilonStep(1);
            return true;
        } finally {
            statesTensor.dispose();
            targetTensor.dispose();
        }
    }

    retrainAfterRound(iterations) {
        const rounds = Number.isFinite(iterations) ? Math.max(1, Math.floor(iterations)) : 16;
        this._pendingRoundRetrains += 1;
        if (this._retrainBusy) return Promise.resolve(0);
        if (this.memory.length < this.batchSize) {
            this._pendingRoundRetrains = 0;
            return Promise.resolve(0);
        }

        this._retrainBusy = true;
        return (async () => {
            let trainedBatches = 0;
            try {
                while (this._pendingRoundRetrains > 0) {
                    this._pendingRoundRetrains -= 1;
                    for (let i = 0; i < rounds; i++) {
                        if (this.memory.length < this.batchSize) break;
                        const didTrain = await this._trainReplayBatchAsync("retrain");
                        if (didTrain) trainedBatches++;
                    }
                }
            } catch (err) {
                console.warn("QAgent round retrain error:", err);
            } finally {
                this._retrainBusy = false;
            }
            return trainedBatches;
        })();
    }

    finishEpisode(summary) {
        // Epsilon is intentionally adjusted only by successful training batches.
        // Round summaries are still accepted for compatibility, but do not mutate epsilon.
        void summary;
        this.epsilon = Math.max(this.epsilonMin, Math.min(this.epsilonMax, this.epsilon));
    }

    _serializeWeights() {
        const tensors = this.model.getWeights();
        return tensors.map((t) => ({
            shape: Array.isArray(t.shape) ? t.shape.slice() : [],
            data: Array.from(t.dataSync()),
        }));
    }

    _applySerializedWeights(weightData) {
        if (!Array.isArray(weightData) || !weightData.length) {
            throw new Error("Invalid weight payload.");
        }

        const tensors = weightData.map((w) => {
            if (!w || !Array.isArray(w.shape) || !Array.isArray(w.data)) {
                throw new Error("Malformed tensor in weight payload.");
            }
            return tf.tensor(w.data, w.shape, "float32");
        });

        try {
            this.model.setWeights(tensors);
        } finally {
            for (const t of tensors) t.dispose();
        }
    }

    saveToLocalStorage() {
        try {
            const payload = {
                version: 2,
                agentId: this.id,
                storageKey: this.storageKey,
                epsilon: this.epsilon,
                savedAt: Date.now(),
                weights: this._serializeWeights(),
            };
            localStorage.setItem(this.storageKey, JSON.stringify(payload));
            this.lastSavedAt = payload.savedAt;
            return true;
        } catch (err) {
            console.warn("QAgent save failed:", err);
            return false;
        }
    }

    _loadFromLocalStorageSafe() {
        try {
            const primaryRaw = localStorage.getItem(this.storageKey);
            const raw = primaryRaw || (this.fallbackStorageKey ? localStorage.getItem(this.fallbackStorageKey) : null);
            if (!raw) return false;

            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.weights)) return false;

            this._applySerializedWeights(parsed.weights);
            if (Number.isFinite(parsed.epsilon)) {
                this.epsilon = clamp01(parsed.epsilon);
                if (this.epsilon < this.epsilonMin) this.epsilon = this.epsilonMin;
            }
            if (Number.isFinite(parsed.savedAt)) {
                this.lastSavedAt = parsed.savedAt;
            }
            return true;
        } catch (err) {
            console.warn("QAgent load failed:", err);
            return false;
        }
    }

    clearStorage() {
        try {
            localStorage.removeItem(this.storageKey);
            if (this.fallbackStorageKey && this.fallbackStorageKey !== this.storageKey) {
                localStorage.removeItem(this.fallbackStorageKey);
            }
        } catch (_) {
            // Ignore storage failures.
        }
    }

    reset() {
        const oldModel = this.model;
        this.model = this._buildModel();
        this.memory.length = 0;
        this.epsilon = 1.0;
        this.lastLoss = 0;
        this.lastOnlineLoss = 0;
        this.lastRetrainLoss = 0;
        this.lastInferenceMs = 0;
        this.totalTrainBatches = 0;
        this.lastSavedAt = 0;
        this._pendingRoundRetrains = 0;

        if (oldModel && typeof oldModel.dispose === "function") {
            oldModel.dispose();
        }

        this._warmModel();
    }

    exportWeights() {
        const payload = {
            version: 2,
            agentId: this.id,
            storageKey: this.storageKey,
            epsilon: this.epsilon,
            savedAt: Date.now(),
            weights: this._serializeWeights(),
        };

        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = this.exportFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    importWeightsFromObject(payload) {
        const source = payload && payload.combined && Array.isArray(payload.combined.weights)
            ? payload.combined
            : payload;

        if (!source || !Array.isArray(source.weights)) {
            throw new Error("Invalid import file format.");
        }

        this._applySerializedWeights(source.weights);
        if (Number.isFinite(source.epsilon)) {
            this.epsilon = Math.max(this.epsilonMin, Math.min(this.epsilonMax, source.epsilon));
        }

        this.memory.length = 0;
        this.saveToLocalStorage();
    }

    importWeightsFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error("No file selected."));
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const payload = JSON.parse(String(reader.result || ""));
                    this.importWeightsFromObject(payload);
                    resolve(true);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error("Failed to read file."));
            reader.readAsText(file);
        });
    }
}

class QLearningController {
    constructor(agent, game, selfPort, fallbackEnemyPort) {
        this.agent = agent;
        this.game = game;
        this.selfPort = selfPort;
        this.fallbackEnemyPort = fallbackEnemyPort;

        this.lastState = null;
        this.lastAction = ACTIONS.IDLE;
        this.lastActionName = ACTION_NAMES[ACTIONS.IDLE];
    }

    poll() {
        const inp = new SMASH.InputState();
        try {
            const me = this._findFighter(this.selfPort);
            if (!me || !me.isAlive) return inp;

            const enemy = this._pickEnemy(me);
            if (!enemy) return inp;

            const stateVector = this._buildStateVector(me, enemy);
            const action = this.agent.act(stateVector);

            this.lastState = stateVector;
            this.lastAction = action;
            this.lastActionName = ACTION_NAMES[action] || ACTION_NAMES[ACTIONS.IDLE];

            this._applyAction(inp, action, me, enemy);
        } catch (err) {
            console.warn("QLearningController poll failed; returning neutral input.", err);
        }
        return inp;
    }

    peekNextState() {
        const me = this._findFighter(this.selfPort);
        if (!me || !me.isAlive) return new Array(8).fill(0);

        const enemy = this._pickEnemy(me);
        if (!enemy) return new Array(8).fill(0);

        return this._buildStateVector(me, enemy);
    }

    _findFighter(port) {
        const players = this.game && this.game.players;
        if (!Array.isArray(players)) return null;
        const p = players.find((x) => x.port === port);
        return p ? p.fighter : null;
    }

    _pickEnemy(me) {
        const fighters = this.game && this.game.fighters;
        if (!Array.isArray(fighters) || !fighters.length) return null;

        let best = null;
        let bestDist = Infinity;

        for (const other of fighters) {
            if (!teamEnemyCheck(me, other)) continue;

            const dx = (other.x || 0) - (me.x || 0);
            const dy = (other.y || 0) - (me.y || 0);
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
                bestDist = d2;
                best = other;
            }
        }

        if (best) return best;

        if (Number.isInteger(this.fallbackEnemyPort)) {
            return this._findFighter(this.fallbackEnemyPort);
        }

        return null;
    }

    _health01(f) {
        if (!f) return 0;
        if (f.maxStaminaHP > 0) {
            return clamp01((f.staminaHP || 0) / f.maxStaminaHP);
        }

        const dmg = Math.max(0, Number(f.damagePercent) || 0);
        return clamp01(1 - dmg / 300);
    }

    _buildStateVector(ai, player) {
        const stage = this.game && this.game.stage;
        const bz = stage && stage.blastZone
            ? stage.blastZone
            : { x: 0, y: 0, w: 1280, h: 720 };

        return [
            normRange(ai.x || 0, bz.x, bz.x + bz.w),
            normRange(ai.y || 0, bz.y, bz.y + bz.h),
            normRange(player.x || 0, bz.x, bz.x + bz.w),
            normRange(player.y || 0, bz.y, bz.y + bz.h),
            this._health01(ai),
            this._health01(player),
            normSigned(player.vx || 0, 1200),
            normSigned(player.vy || 0, 1200),
        ];
    }

    _applyAction(inp, action, me, enemy) {
        switch (action) {
            case ACTIONS.MOVE_LEFT:
                inp.moveX = -1;
                break;
            case ACTIONS.MOVE_RIGHT:
                inp.moveX = 1;
                break;
            case ACTIONS.JUMP:
                inp.jump = true;
                inp.moveY = -1;
                break;
            case ACTIONS.ATTACK:
                inp.attack = true;
                break;
            case ACTIONS.DODGE:
                inp.shield = true;
                if (enemy) inp.moveX = me.x < enemy.x ? -1 : 1;
                break;
            case ACTIONS.IDLE:
            default:
                break;
        }
    }
}

class TrainingPanel {
    constructor() {
        this.root = null;
        this.graphCanvas = null;
        this.graphCtx = null;

        this.statsEls = {
            episode: null,
            epsilon: null,
            p1Score: null,
            p2Score: null,
            winRate: null,
            avgReward: null,
            speed: null,
        };

        this._statusEl = null;
        this._speedButtons = [];
        this._p1ControlBtn = null;
        this._epsilonZeroBtn = null;
        this._epsilonRestoreBtn = null;

        this.onSpeedChange = null;
        this.onReset = null;
        this.onExport = null;
        this.onImportFile = null;
        this.onP1ControlToggle = null;
        this.onEpsilonZeroToggle = null;
        this.onEpsilonRestore = null;

        this._create();
    }

    _create() {
        if (document.getElementById("qlearn-trainer-style")) return;

        const style = document.createElement("style");
        style.id = "qlearn-trainer-style";
        style.textContent = [
            "#qlearnTrainerPanel {",
            "  position: fixed;",
            "  width: 276px;",
            "  padding: 14px;",
            "  border-radius: 12px;",
            "  border: 1px solid #2a313a;",
            "  background: linear-gradient(160deg, #10161f 0%, #141d2b 56%, #101820 100%);",
            "  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);",
            "  color: #d5e2f0;",
            "  font-family: Consolas, 'Lucida Console', 'Segoe UI', sans-serif;",
            "  z-index: 85;",
            "  display: none;",
            "  user-select: none;",
            "}",
            "#qlearnTrainerPanel .q-title {",
            "  font-size: 16px;",
            "  font-weight: 700;",
            "  letter-spacing: 0.8px;",
            "  color: #9ed6ff;",
            "}",
            "#qlearnTrainerPanel .q-sub {",
            "  font-size: 11px;",
            "  color: #7f97ac;",
            "  margin: 2px 0 10px 0;",
            "}",
            "#qlearnTrainerPanel .q-stats {",
            "  border: 1px solid #2a313a;",
            "  background: rgba(7, 11, 16, 0.55);",
            "  border-radius: 8px;",
            "  padding: 8px;",
            "}",
            "#qlearnTrainerPanel .q-stat-row {",
            "  display: flex;",
            "  justify-content: space-between;",
            "  font-size: 12px;",
            "  line-height: 1.55;",
            "}",
            "#qlearnTrainerPanel .q-stat-row span { color: #8ca2b9; }",
            "#qlearnTrainerPanel .q-stat-row strong { color: #e8f2ff; font-weight: 700; }",
            "#qlearnTrainerPanel .q-graph-wrap { margin-top: 10px; }",
            "#qlearnTrainerGraph {",
            "  width: 200px;",
            "  height: 100px;",
            "  border: 1px solid #2a313a;",
            "  border-radius: 6px;",
            "  background: #0b1018;",
            "}",
            "#qlearnTrainerPanel .q-speed-row {",
            "  margin-top: 10px;",
            "  display: flex;",
            "  gap: 6px;",
            "}",
            "#qlearnTrainerPanel .q-btn {",
            "  flex: 1;",
            "  border: 1px solid #2f3742;",
            "  border-radius: 6px;",
            "  background: #1b2432;",
            "  color: #cfe4ff;",
            "  padding: 6px 8px;",
            "  font-size: 12px;",
            "  cursor: pointer;",
            "}",
            "#qlearnTrainerPanel .q-btn:hover { background: #233146; }",
            "#qlearnTrainerPanel .q-btn.active {",
            "  background: #2f8fdb;",
            "  border-color: #61b6ff;",
            "  color: #fff;",
            "}",
            "#qlearnTrainerPanel .q-action-btn {",
            "  width: 100%;",
            "  margin-top: 7px;",
            "  border: 1px solid #2f3742;",
            "  border-radius: 6px;",
            "  background: #17202d;",
            "  color: #d7ebff;",
            "  padding: 8px;",
            "  font-size: 12px;",
            "  cursor: pointer;",
            "  text-align: center;",
            "}",
            "#qlearnTrainerPanel .q-action-btn:hover { background: #203149; }",
            "#qlearnTrainerPanel .q-action-btn.warn {",
            "  background: #3a1f1f;",
            "  border-color: #734141;",
            "  color: #ffd5d5;",
            "}",
            "#qlearnTrainerPanel .q-action-btn.toggle-active {",
            "  background: #264b1f;",
            "  border-color: #4e9355;",
            "  color: #dcffdc;",
            "}",
            "#qlearnTrainerPanel .q-action-btn:disabled {",
            "  opacity: 0.55;",
            "  cursor: default;",
            "}",
            "#qlearnTrainerPanel .q-status {",
            "  margin-top: 8px;",
            "  font-size: 11px;",
            "  color: #7f97ac;",
            "  min-height: 14px;",
            "}",
        ].join("\n");
        document.head.appendChild(style);

        const panel = document.createElement("div");
        panel.id = "qlearnTrainerPanel";
        panel.innerHTML = [
            '<div class="q-title">Q-LEARNING TRAINER</div>',
            '<div class="q-sub">Dual Self-Play + Shared Learning</div>',
            '<div class="q-stats">',
            '  <div class="q-stat-row"><span>Episode</span><strong id="qStatEpisode">0</strong></div>',
            '  <div class="q-stat-row"><span>Epsilon</span><strong id="qStatEpsilon">1.000</strong></div>',
            '  <div class="q-stat-row"><span>P1 Score</span><strong id="qStatP1Score">--</strong></div>',
            '  <div class="q-stat-row"><span>P2 Score</span><strong id="qStatP2Score">0.00</strong></div>',
            '  <div class="q-stat-row"><span>Win Rate</span><strong id="qStatWinRate">0.0%</strong></div>',
            '  <div class="q-stat-row"><span>Avg Reward (20)</span><strong id="qStatAvgReward">0.00</strong></div>',
            '  <div class="q-stat-row"><span>Speed</span><strong id="qStatSpeed">1x</strong></div>',
            "</div>",
            '<div class="q-graph-wrap"><canvas id="qlearnTrainerGraph" width="200" height="100"></canvas></div>',
            '<div class="q-speed-row">',
            '  <button class="q-btn active" data-speed="1">1x</button>',
            '  <button class="q-btn" data-speed="5">5x</button>',
            '  <button class="q-btn" data-speed="10">10x</button>',
            "</div>",
            '<button id="qP1ControlBtn" class="q-action-btn">Take Over P1</button>',
            '<button id="qEpsilonZeroBtn" class="q-action-btn">Epsilon 3%</button>',
            '<button id="qEpsilonRestoreBtn" class="q-action-btn" disabled>Restore Epsilon</button>',
            '<button id="qResetBtn" class="q-action-btn warn">Reset AI</button>',
            '<button id="qExportBtn" class="q-action-btn">Export Weights</button>',
            '<button id="qImportBtn" class="q-action-btn">Import Weights</button>',
            '<input id="qImportInput" type="file" accept="application/json,.json" style="display:none">',
            '<div id="qStatus" class="q-status">Ready.</div>',
        ].join("");

        document.body.appendChild(panel);

        this.root = panel;
        this.graphCanvas = panel.querySelector("#qlearnTrainerGraph");
        this.graphCtx = this.graphCanvas.getContext("2d");

        this.statsEls.episode = panel.querySelector("#qStatEpisode");
        this.statsEls.epsilon = panel.querySelector("#qStatEpsilon");
        this.statsEls.p1Score = panel.querySelector("#qStatP1Score");
        this.statsEls.p2Score = panel.querySelector("#qStatP2Score");
        this.statsEls.winRate = panel.querySelector("#qStatWinRate");
        this.statsEls.avgReward = panel.querySelector("#qStatAvgReward");
        this.statsEls.speed = panel.querySelector("#qStatSpeed");

        this._statusEl = panel.querySelector("#qStatus");
        this._p1ControlBtn = panel.querySelector("#qP1ControlBtn");
        this._epsilonZeroBtn = panel.querySelector("#qEpsilonZeroBtn");
        this._epsilonRestoreBtn = panel.querySelector("#qEpsilonRestoreBtn");

        this._speedButtons = Array.from(panel.querySelectorAll(".q-btn[data-speed]"));
        for (const btn of this._speedButtons) {
            btn.addEventListener("click", () => {
                const speed = parseInt(btn.getAttribute("data-speed"), 10) || 1;
                this.setSpeed(speed);
                if (this.onSpeedChange) this.onSpeedChange(speed);
            });
        }

        const resetBtn = panel.querySelector("#qResetBtn");
        const exportBtn = panel.querySelector("#qExportBtn");
        const importBtn = panel.querySelector("#qImportBtn");
        const importInput = panel.querySelector("#qImportInput");

        resetBtn.addEventListener("click", () => {
            if (this.onReset) this.onReset();
        });

        exportBtn.addEventListener("click", () => {
            if (this.onExport) this.onExport();
        });

        importBtn.addEventListener("click", () => importInput.click());
        importInput.addEventListener("change", () => {
            const file = importInput.files && importInput.files[0];
            if (file && this.onImportFile) this.onImportFile(file);
            importInput.value = "";
        });

        if (this._p1ControlBtn) {
            this._p1ControlBtn.addEventListener("click", () => {
                if (this.onP1ControlToggle) this.onP1ControlToggle();
            });
        }

        if (this._epsilonZeroBtn) {
            this._epsilonZeroBtn.addEventListener("click", () => {
                if (this.onEpsilonZeroToggle) this.onEpsilonZeroToggle();
            });
        }

        if (this._epsilonRestoreBtn) {
            this._epsilonRestoreBtn.addEventListener("click", () => {
                if (this.onEpsilonRestore) this.onEpsilonRestore();
            });
        }

        this.setEpsilonOverrideState(false, false);
        this.setP1ControlState(false, false);

        this.drawRewardGraph([]);
    }

    setVisible(visible) {
        if (!this.root) return;
        this.root.style.display = visible ? "block" : "none";
    }

    setStatus(text) {
        if (!this._statusEl) return;
        this._statusEl.textContent = String(text || "");
    }

    setEpsilonOverrideState(isActive, canRestore) {
        if (this._epsilonZeroBtn) {
            this._epsilonZeroBtn.classList.toggle("toggle-active", !!isActive);
            this._epsilonZeroBtn.textContent = isActive ? "Epsilon 3% (Active)" : "Epsilon 3%";
        }
        if (this._epsilonRestoreBtn) {
            this._epsilonRestoreBtn.disabled = !canRestore;
        }
    }

    setP1ControlState(isHumanControl, canToggle) {
        if (!this._p1ControlBtn) return;

        this._p1ControlBtn.disabled = !canToggle;
        this._p1ControlBtn.classList.toggle("toggle-active", !!isHumanControl);
        this._p1ControlBtn.textContent = isHumanControl
            ? "Return P1 To AI"
            : "Take Over P1";
    }

    setSpeed(speed) {
        for (const btn of this._speedButtons) {
            const s = parseInt(btn.getAttribute("data-speed"), 10) || 1;
            btn.classList.toggle("active", s === speed);
        }
        if (this.statsEls.speed) this.statsEls.speed.textContent = `${speed}x`;
    }

    updateStats(stats) {
        if (!stats) return;

        if (this.statsEls.episode) this.statsEls.episode.textContent = String(stats.episode || 0);
        if (this.statsEls.epsilon) {
            if (typeof stats.epsilonLabel === "string" && stats.epsilonLabel.length > 0) {
                this.statsEls.epsilon.textContent = stats.epsilonLabel;
            } else {
                this.statsEls.epsilon.textContent = (stats.epsilon || 0).toFixed(3);
            }
        }
        if (this.statsEls.p1Score) {
            this.statsEls.p1Score.textContent = Number.isFinite(stats.p1Score)
                ? stats.p1Score.toFixed(2)
                : "--";
        }
        if (this.statsEls.p2Score) {
            this.statsEls.p2Score.textContent = Number.isFinite(stats.p2Score)
                ? stats.p2Score.toFixed(2)
                : "--";
        }
        if (this.statsEls.winRate) this.statsEls.winRate.textContent = `${(stats.winRate || 0).toFixed(1)}%`;
        if (this.statsEls.avgReward) this.statsEls.avgReward.textContent = (stats.avgReward || 0).toFixed(2);
    }

    drawRewardGraph(rewards) {
        const ctx = this.graphCtx;
        const c = this.graphCanvas;
        if (!ctx || !c) return;

        const w = c.width;
        const h = c.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#0b1018";
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "rgba(120,140,160,0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.5);
        ctx.lineTo(w, h * 0.5);
        ctx.stroke();

        if (!Array.isArray(rewards) || rewards.length === 0) {
            ctx.fillStyle = "#6f8193";
            ctx.font = "11px Consolas";
            ctx.fillText("Waiting for episodes...", 10, 56);
            return;
        }

        const min = Math.min(...rewards, -1);
        const max = Math.max(...rewards, 1);
        const range = Math.max(1, max - min);

        ctx.strokeStyle = "#59c0ff";
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < rewards.length; i++) {
            const x = (i / Math.max(1, rewards.length - 1)) * (w - 1);
            const y = h - ((rewards[i] - min) / range) * (h - 1);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();

        const last = rewards[rewards.length - 1];
        const lx = (rewards.length - 1) / Math.max(1, rewards.length - 1) * (w - 1);
        const ly = h - ((last - min) / range) * (h - 1);
        ctx.fillStyle = last >= 0 ? "#4df08a" : "#ff6f6f";
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    repositionNearCanvas(canvasEl) {
        if (!this.root || !canvasEl) return;
        if (this.root.style.display === "none") return;

        const rect = canvasEl.getBoundingClientRect();
        const panelW = this.root.offsetWidth || 276;
        const panelH = this.root.offsetHeight || 440;

        let left = rect.right + 14;
        if (left + panelW > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - panelW - 8);
        }

        let top = rect.top;
        const maxTop = window.innerHeight - panelH - 8;
        if (top > maxTop) top = maxTop;
        if (top < 8) top = 8;

        this.root.style.left = `${Math.round(left)}px`;
        this.root.style.top = `${Math.round(top)}px`;
    }
}

class QTrainingRuntime {
    constructor() {
        this.agent = null;
        this.agents = {
            p1: null,
            p2: null,
        };
        this.panel = new TrainingPanel();

        this.speed = 1;
        this.trainingEnabled = true;
        this.matchMode = "single";
        this.activeGame = null;
        this._menuControls = {
            enabled: null,
            speed: null,
            archiveMixChance: null,
            archiveMixFactor: null,
            matchupRandomizeChance: null,
            stageRandomizeChance: null,
        };
        this._menuTelemetryEls = {
            p1Learning: null,
            p1Saving: null,
            p2Learning: null,
            p2Saving: null,
            combinedLearning: null,
            combinedSaving: null,
        };
        this._epsilonOverride = {
            active: false,
            snapshot: null,
        };

        this.stats = this._newRuntimeStats();
        this._curriculumCfg = {
            archiveMixChance: DUAL_ARCHIVE_MIX_CHANCE,
            archiveMixFactor: DUAL_ARCHIVE_MIX_FACTOR,
            matchupRandomizeChance: DUAL_RANDOMIZE_MATCHUP_CHANCE,
            stageRandomizeChance: DUAL_RANDOMIZE_STAGE_CHANCE,
        };

        this._panelTick = 0;
        this._dualArchive = [];

        this._initAgents();
        this._loadDualArchive();
        this._bindMenuControls();
        this._bindPanel();
        this.panel.setSpeed(this.speed);
        this._refreshPanelStats();
        this._refreshMenuTelemetry();
    }

    _newEpisodeCombat() {
        return {
            dealtDamage: 0,
            takenDamage: 0,
            selfFalls: 0,
            enemyFalls: 0,
            selfDestructs: 0,
        };
    }

    _newSlotStats() {
        return {
            episodes: 0,
            wins: 0,
            currentEpisodeReward: 0,
            rewardLast20: [],
            rewardLast50: [],
            episodeCombat: this._newEpisodeCombat(),
            combatStallTicks: 0,
            goodEvents: 0,
            mistakeEvents: 0,
            lastRoundReward: 0,
            lastSavedAt: 0,
        };
    }

    _newRuntimeStats() {
        return {
            rounds: 0,
            rewardLast50: [],
            mergeCount: 0,
            lastMergeAt: 0,
            slots: {
                p1: this._newSlotStats(),
                p2: this._newSlotStats(),
            },
        };
    }

    _activeSlotKeys() {
        if (this.matchMode === "dual") {
            return this._isP1HumanOverride(this.activeGame) ? ["p2"] : ["p1", "p2"];
        }
        return ["p2"];
    }

    _initAgents() {
        if (!window.tf) {
            this.panel.setStatus("TensorFlow.js failed to load.");
            return;
        }

        try {
            this.agents.p1 = new QAgent({
                id: "P1",
                storageKey: STORAGE_KEYS.p1,
                exportFilename: EXPORT_FILENAMES.p1,
            });
            this.agents.p2 = new QAgent({
                id: "P2",
                storageKey: STORAGE_KEYS.p2,
                fallbackStorageKey: LEGACY_STORAGE_KEY,
                exportFilename: EXPORT_FILENAMES.p2,
            });
            this.agent = this.agents.p2;
            this.panel.setStatus("Model ready.");
        } catch (err) {
            console.error(err);
            this.panel.setStatus("AI init failed.");
        }
    }

    _loadCombinedStorageIntoAgents() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.combined);
            if (!raw) return false;

            const payload = JSON.parse(raw);
            if (!payload || !payload.combined || !Array.isArray(payload.combined.weights)) return false;

            const weights = payload.combined.weights;
            if (this.agents.p1) this.agents.p1._applySerializedWeights(weights);
            if (this.agents.p2) this.agents.p2._applySerializedWeights(weights);

            if (Number.isFinite(payload.combined.epsilon)) {
                this._setAgentEpsilon(this.agents.p1, payload.combined.epsilon);
                this._setAgentEpsilon(this.agents.p2, payload.combined.epsilon);
            }

            if (Number.isFinite(payload.mergeCount)) {
                this.stats.mergeCount = Math.max(0, Math.floor(payload.mergeCount));
            }
            if (Number.isFinite(payload.savedAt)) {
                this.stats.lastMergeAt = payload.savedAt;
            }

            return true;
        } catch (err) {
            console.warn("Combined model preload failed:", err);
            return false;
        }
    }

    _loadDualArchive() {
        try {
            const raw = localStorage.getItem(DUAL_ARCHIVE_STORAGE_KEY);
            if (!raw) {
                this._dualArchive = [];
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                this._dualArchive = [];
                return;
            }

            this._dualArchive = parsed
                .filter((x) => x && Array.isArray(x.weights))
                .slice(-DUAL_ARCHIVE_MAX_SNAPSHOTS);
        } catch (_) {
            this._dualArchive = [];
        }
    }

    _saveDualArchive() {
        try {
            localStorage.setItem(
                DUAL_ARCHIVE_STORAGE_KEY,
                JSON.stringify(this._dualArchive.slice(-DUAL_ARCHIVE_MAX_SNAPSHOTS))
            );
        } catch (_) {
            // Ignore storage failures.
        }
    }

    _recordDualArchiveSnapshot(mergedWeights, mergedEpsilon) {
        if (this.matchMode !== "dual") return;
        if (!Array.isArray(mergedWeights) || !mergedWeights.length) return;
        if ((this.stats.rounds % DUAL_ARCHIVE_PUSH_INTERVAL) !== 0) return;

        this._dualArchive.push({
            savedAt: Date.now(),
            round: this.stats.rounds,
            epsilon: Number.isFinite(mergedEpsilon) ? mergedEpsilon : null,
            weights: mergedWeights,
        });

        if (this._dualArchive.length > DUAL_ARCHIVE_MAX_SNAPSHOTS) {
            this._dualArchive.splice(0, this._dualArchive.length - DUAL_ARCHIVE_MAX_SNAPSHOTS);
        }

        this._saveDualArchive();
    }

    _pickRandomCharacterKey() {
        if (typeof SMASH.getCharacterKeys !== "function") return null;
        const keys = SMASH.getCharacterKeys();
        if (!Array.isArray(keys) || keys.length === 0) return null;
        return keys[(Math.random() * keys.length) | 0] || null;
    }

    _setPlayerCharacter(game, port, characterKey) {
        if (!game || !characterKey) return false;
        const player = this._getPlayer(game, port);
        if (!player || !player.fighter) return false;

        try {
            const fighter = player.fighter;
            const newData = new SMASH.FighterData(characterKey);
            fighter.data = newData;
            fighter.width = newData.width;
            fighter.height = newData.height;
            player.characterKey = characterKey;
            return true;
        } catch (err) {
            console.warn(`Failed to set character for port ${port}:`, err);
            return false;
        }
    }

    _randomizeDualMatchup(game) {
        const c1 = this._pickRandomCharacterKey();
        let c2 = this._pickRandomCharacterKey();
        if (!c1 || !c2) return false;

        if (c1 === c2 && typeof SMASH.getCharacterKeys === "function") {
            const keys = SMASH.getCharacterKeys();
            if (Array.isArray(keys) && keys.length > 1) {
                const alternatives = keys.filter((key) => key !== c1);
                if (alternatives.length > 0) {
                    c2 = alternatives[(Math.random() * alternatives.length) | 0] || c2;
                }
            }
        }

        const ok1 = this._setPlayerCharacter(game, 0, c1);
        const ok2 = this._setPlayerCharacter(game, 1, c2);
        return ok1 && ok2;
    }

    _randomizeDualStage(game) {
        if (!game || !SMASH.StageLibrary) return false;
        const entries = Object.entries(SMASH.StageLibrary)
            .filter(([, factory]) => typeof factory === "function");
        if (!entries.length) return false;

        const currentKey = game._settings && game._settings.stageKey ? game._settings.stageKey : null;
        let pool = entries;
        if (currentKey && entries.length > 1) {
            pool = entries.filter(([key]) => key !== currentKey);
            if (!pool.length) pool = entries;
        }

        const [stageKey, factory] = pool[(Math.random() * pool.length) | 0];
        try {
            game.stage = factory();
            if (game._settings) game._settings.stageKey = stageKey;
            return true;
        } catch (err) {
            console.warn("Failed to randomize dual stage:", err);
            return false;
        }
    }

    _warmupLerp(start, end, t) {
        const clamped = Math.max(0, Math.min(1, Number(t) || 0));
        return start + (end - start) * clamped;
    }

    _getEffectiveCurriculumCfg() {
        const base = this._curriculumCfg;
        const rounds = Number.isFinite(this.stats.rounds) ? this.stats.rounds : 0;
        if (rounds >= DUAL_CURRICULUM_WARMUP_ROUNDS) {
            return {
                archiveMixChance: base.archiveMixChance,
                archiveMixFactor: base.archiveMixFactor,
                matchupRandomizeChance: base.matchupRandomizeChance,
                stageRandomizeChance: base.stageRandomizeChance,
            };
        }

        const progress = rounds / DUAL_CURRICULUM_WARMUP_ROUNDS;
        return {
            archiveMixChance: base.archiveMixChance * this._warmupLerp(DUAL_WARMUP_ARCHIVE_MIX_SCALE_START, 1, progress),
            archiveMixFactor: base.archiveMixFactor * this._warmupLerp(DUAL_WARMUP_ARCHIVE_FACTOR_SCALE_START, 1, progress),
            matchupRandomizeChance: base.matchupRandomizeChance * this._warmupLerp(DUAL_WARMUP_MATCHUP_SCALE_START, 1, progress),
            stageRandomizeChance: base.stageRandomizeChance * this._warmupLerp(DUAL_WARMUP_STAGE_SCALE_START, 1, progress),
        };
    }

    _mixHistoricalOpponentPolicy(curriculumCfg) {
        const cfg = curriculumCfg || this._curriculumCfg;
        if (!Array.isArray(this._dualArchive) || this._dualArchive.length < 2) return false;
        if (Math.random() > cfg.archiveMixChance) return false;

        // Prefer older snapshots to reduce policy-collapse loops.
        const upper = Math.max(1, this._dualArchive.length - 1);
        const idx = (Math.random() * upper) | 0;
        const snapshot = this._dualArchive[idx];
        if (!snapshot || !Array.isArray(snapshot.weights)) return false;

        const targetKey = Math.random() < 0.5 ? "p1" : "p2";
        const target = this.agents[targetKey];
        if (!target) return false;

        try {
            const current = target._serializeWeights();
            const blended = this._blendWeightPayload(current, snapshot.weights, cfg.archiveMixFactor);
            target._applySerializedWeights(blended);
            if (!this._epsilonOverride.active) {
                this._setAgentEpsilon(target, Math.max(target.epsilon, DUAL_SELFPLAY_EPSILON_FLOOR));
            }
            target.saveToLocalStorage();
            return true;
        } catch (err) {
            console.warn("Historical opponent mix failed:", err);
            return false;
        }
    }

    _prepareDualCurriculumForNextRound(game) {
        if (this.matchMode !== "dual") return;

        const cfg = this._getEffectiveCurriculumCfg();
        const notes = [];

        if (Math.random() < cfg.matchupRandomizeChance && this._randomizeDualMatchup(game)) {
            notes.push("new matchup");
        }

        if (Math.random() < cfg.stageRandomizeChance && this._randomizeDualStage(game)) {
            notes.push("new stage");
        }

        if (this._mixHistoricalOpponentPolicy(cfg)) {
            notes.push("historical policy mix");
        }

        const warmupLeft = Math.max(0, DUAL_CURRICULUM_WARMUP_ROUNDS - this.stats.rounds);
        if (notes.length) {
            const suffix = warmupLeft > 0 ? ` (warmup ${warmupLeft}r left)` : "";
            this.panel.setStatus(`Curriculum: ${notes.join(", ")}${suffix}. Restarting...`);
        } else if (warmupLeft > 0 && (this.stats.rounds % 20) === 0) {
            this.panel.setStatus(`Curriculum warmup active (${warmupLeft} rounds left). Restarting...`);
        }
    }

    _bindPanel() {
        this.panel.onSpeedChange = (speed) => {
            this._setSpeed(speed, "panel");
            this.panel.setStatus(`Training speed: ${this.speed}x`);
        };

        this.panel.onP1ControlToggle = () => {
            this._toggleP1HumanControl();
        };

        this.panel.onEpsilonZeroToggle = () => {
            this._toggleEpsilonZeroOverride();
        };

        this.panel.onEpsilonRestore = () => {
            if (!this._restoreEpsilonOverrideSnapshot()) {
                this.panel.setStatus("No epsilon snapshot to restore.");
            }
        };

        this.panel.onReset = () => {
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;
            if (!p1 && !p2) return;

            this._clearEpsilonOverrideState();

            if (p1) {
                p1.clearStorage();
                p1.reset();
            }
            if (p2) {
                p2.clearStorage();
                p2.reset();
            }
            try {
                localStorage.removeItem(STORAGE_KEYS.combined);
            } catch (_) {
                // Ignore storage failures.
            }

            this.stats = this._newRuntimeStats();

            this.panel.drawRewardGraph([]);
            this._refreshPanelStats();
            this._refreshMenuTelemetry();

            if (this.activeGame && this.activeGame._running) {
                this._clearRestartTimer(this.activeGame);
                this.activeGame._restart();
                this.activeGame.state = "countdown";
            }

            this.panel.setStatus("Both AIs reset. Training restarted.");
        };

        this.panel.onExport = () => {
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;
            if (!p1 && !p2) return;
            try {
                const payload = this._buildCombinedExportPayload();
                this._downloadJSON(payload, EXPORT_FILENAMES.combined);
                this.panel.setStatus("Combined export saved.");
            } catch (err) {
                console.error(err);
                this.panel.setStatus("Export failed.");
            }
        };

        this.panel.onImportFile = (file) => {
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;
            if (!p1 && !p2) return;

            this._clearEpsilonOverrideState();

            this._importPayloadFromFile(file)
                .then(() => {
                    this.panel.setStatus("Imported and applied to both AIs.");
                    this._refreshPanelStats();
                    this._refreshMenuTelemetry();
                    this._focusGameplayInput();
                })
                .catch((err) => {
                    console.error(err);
                    this.panel.setStatus("Import failed. Invalid JSON or shape mismatch.");
                    this._focusGameplayInput();
                });
        };
    }

    _findSlotByKey(game, slotKey) {
        if (!game || !game._qlearnData || !Array.isArray(game._qlearnData.slots)) return null;
        return game._qlearnData.slots.find((slot) => slot && slot.key === slotKey) || null;
    }

    _isP1HumanOverride(game) {
        const p1Slot = this._findSlotByKey(game, "p1");
        return !!(p1Slot && p1Slot.isHumanOverride);
    }

    _toggleP1HumanControl() {
        const game = this.activeGame;
        if (!game || !game._running || !game._qlearnData || this.matchMode !== "dual") {
            this.panel.setStatus("P1 takeover is available only during active double AI training.");
            return false;
        }

        const p1Slot = this._findSlotByKey(game, "p1");
        const p1Player = this._getPlayer(game, 0);
        if (!p1Slot || !p1Player) {
            this.panel.setStatus("P1 takeover is unavailable in this match.");
            return false;
        }

        if (!p1Slot.isHumanOverride) {
            if (typeof SMASH.KeyboardController !== "function") {
                this.panel.setStatus("Keyboard controller unavailable. Cannot take over P1.");
                return false;
            }

            const humanController = new SMASH.KeyboardController("wasd");
            p1Slot.humanController = humanController;
            p1Slot.isHumanOverride = true;
            p1Slot.controller = null;
            p1Player.controller = humanController;
            p1Player.isAI = false;

            this.panel.setStatus("You now control P1 (WASD + F/G/H/T). Click again to return P1 to AI.");
        } else {
            p1Slot.isHumanOverride = false;
            p1Slot.humanController = null;
            p1Slot.controller = p1Slot.aiController || p1Slot.controller;
            if (p1Slot.controller) {
                p1Player.controller = p1Slot.controller;
            }
            p1Player.isAI = true;

            this.panel.setStatus("P1 returned to AI control.");
        }

        this._refreshPanelStats();
        this._refreshMenuTelemetry();
        this._focusGameplayInput();
        return true;
    }

        _downloadJSON(payload, filename) {
            const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        _readJsonFile(file) {
            return new Promise((resolve, reject) => {
                if (!file) {
                    reject(new Error("No file selected."));
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        resolve(JSON.parse(String(reader.result || "")));
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error("Failed to read file."));
                reader.readAsText(file);
            });
        }

        _setAgentEpsilon(agent, value) {
            if (!agent || !Number.isFinite(value)) return;
            agent.epsilon = Math.max(agent.epsilonMin, Math.min(agent.epsilonMax, value));
        }

        _clearEpsilonOverrideState() {
            this._epsilonOverride.active = false;
            this._epsilonOverride.snapshot = null;
            this.panel.setEpsilonOverrideState(false, false);
        }

        _captureEpsilonSnapshot() {
            const snapshot = {};
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;

            if (p1) {
                snapshot.p1 = {
                    epsilon: Number.isFinite(p1.epsilon) ? p1.epsilon : 1,
                    epsilonMin: Number.isFinite(p1.epsilonMin) ? p1.epsilonMin : 0.12,
                };
            }

            if (p2) {
                snapshot.p2 = {
                    epsilon: Number.isFinite(p2.epsilon) ? p2.epsilon : 1,
                    epsilonMin: Number.isFinite(p2.epsilonMin) ? p2.epsilonMin : 0.12,
                };
            }

            return Object.keys(snapshot).length ? snapshot : null;
        }

        _persistAgentEpsilonState() {
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;
            if (p1) p1.saveToLocalStorage();
            if (p2) p2.saveToLocalStorage();
            this._saveCombinedPayload();
        }

        _toggleEpsilonZeroOverride() {
            if (this._epsilonOverride.active) {
                this._restoreEpsilonOverrideSnapshot();
                return;
            }

            const snapshot = this._captureEpsilonSnapshot();
            if (!snapshot) {
                this.panel.setStatus("No active AI found for epsilon override.");
                return;
            }

            const p1 = this.agents.p1;
            const p2 = this.agents.p2;

            if (p1) {
                p1.epsilonMin = Math.min(p1.epsilonMin, EPSILON_OVERRIDE_TARGET);
                this._setAgentEpsilon(p1, EPSILON_OVERRIDE_TARGET);
            }
            if (p2) {
                p2.epsilonMin = Math.min(p2.epsilonMin, EPSILON_OVERRIDE_TARGET);
                this._setAgentEpsilon(p2, EPSILON_OVERRIDE_TARGET);
            }

            this._epsilonOverride.snapshot = snapshot;
            this._epsilonOverride.active = true;
            this.panel.setEpsilonOverrideState(true, true);

            this._persistAgentEpsilonState();
            this._refreshPanelStats();
            this._refreshMenuTelemetry();
            this.panel.setStatus("Epsilon forced to 3%. Click Restore Epsilon to revert.");
        }

        _restoreEpsilonOverrideSnapshot() {
            const snapshot = this._epsilonOverride.snapshot;
            const wasActive = this._epsilonOverride.active;
            if (!snapshot || typeof snapshot !== "object") {
                this._clearEpsilonOverrideState();
                return false;
            }

            const p1 = this.agents.p1;
            const p2 = this.agents.p2;

            if (p1 && snapshot.p1) {
                p1.epsilonMin = Number.isFinite(snapshot.p1.epsilonMin) ? snapshot.p1.epsilonMin : p1.epsilonMin;
                this._setAgentEpsilon(p1, snapshot.p1.epsilon);
            }
            if (p2 && snapshot.p2) {
                p2.epsilonMin = Number.isFinite(snapshot.p2.epsilonMin) ? snapshot.p2.epsilonMin : p2.epsilonMin;
                this._setAgentEpsilon(p2, snapshot.p2.epsilon);
            }

            this._clearEpsilonOverrideState();
            this._persistAgentEpsilonState();
            this._refreshPanelStats();
            this._refreshMenuTelemetry();

            if (wasActive) {
                this.panel.setStatus("Epsilon restored to pre-override values.");
            }
            return true;
        }

        _rewarmDualExplorationIfNeeded() {
            if (this.matchMode !== "dual") return;
            if (this._epsilonOverride.active) return;

            const p1 = this.agents.p1;
            const p2 = this.agents.p2;
            let changed = false;

            if (p1 && p1.epsilon < DUAL_SELFPLAY_EPSILON_FLOOR) {
                this._setAgentEpsilon(p1, DUAL_SELFPLAY_EPSILON_FLOOR);
                p1.saveToLocalStorage();
                changed = true;
            }

            if (p2 && p2.epsilon < DUAL_SELFPLAY_EPSILON_FLOOR) {
                this._setAgentEpsilon(p2, DUAL_SELFPLAY_EPSILON_FLOOR);
                p2.saveToLocalStorage();
                changed = true;
            }

            if (changed) {
                this.panel.setStatus("Dual self-play epsilon rewarmed for active learning.");
                this._refreshPanelStats();
            }
        }

        _importPayloadFromFile(file) {
            return this._readJsonFile(file).then((payload) => {
                this._applyImportPayload(payload);
                this._saveCombinedPayload();
            });
        }

        _applyImportPayload(payload) {
            if (!payload || typeof payload !== "object") {
                throw new Error("Invalid import payload.");
            }

            const p1 = this.agents.p1;
            const p2 = this.agents.p2;

            const applyToAgent = (agent, source) => {
                if (!agent || !source || !Array.isArray(source.weights)) return false;
                agent._applySerializedWeights(source.weights);
                if (Number.isFinite(source.epsilon)) {
                    this._setAgentEpsilon(agent, source.epsilon);
                }
                agent.memory.length = 0;
                return true;
            };

            let applied = false;

            if (payload.combined && Array.isArray(payload.combined.weights)) {
                const a = applyToAgent(p1, payload.combined);
                const b = applyToAgent(p2, payload.combined);
                applied = a || b;
            }

            if (!applied && payload.agents && typeof payload.agents === "object") {
                const p1Applied = applyToAgent(p1, payload.agents.p1);
                const p2Applied = applyToAgent(p2, payload.agents.p2);

                if (!p2Applied && p1Applied) applyToAgent(p2, payload.agents.p1);
                if (!p1Applied && p2Applied) applyToAgent(p1, payload.agents.p2);

                applied = p1Applied || p2Applied;
            }

            if (!applied && Array.isArray(payload.weights)) {
                const a = applyToAgent(p1, payload);
                const b = applyToAgent(p2, payload);
                applied = a || b;
            }

            if (!applied) {
                throw new Error("No usable weights found in import file.");
            }

            if (Number.isFinite(payload.mergeCount)) {
                this.stats.mergeCount = Math.max(0, Math.floor(payload.mergeCount));
            }
            this.stats.lastMergeAt = Date.now();

            if (p1) p1.saveToLocalStorage();
            if (p2) p2.saveToLocalStorage();
        }

        _averageWeightPayload(weightsA, weightsB) {
            if (!Array.isArray(weightsA) || !Array.isArray(weightsB) || !weightsA.length || !weightsB.length) {
                throw new Error("Cannot merge empty weight payloads.");
            }
            if (weightsA.length !== weightsB.length) {
                throw new Error("Weight payload size mismatch.");
            }

            const merged = [];
            for (let idx = 0; idx < weightsA.length; idx++) {
                const wa = weightsA[idx];
                const wb = weightsB[idx];
                if (!wa || !wb || !Array.isArray(wa.shape) || !Array.isArray(wb.shape)) {
                    throw new Error("Malformed tensor in payload.");
                }

                const shapeA = JSON.stringify(wa.shape);
                const shapeB = JSON.stringify(wb.shape);
                if (shapeA !== shapeB) {
                    throw new Error("Tensor shape mismatch during merge.");
                }

                if (!Array.isArray(wa.data) || !Array.isArray(wb.data) || wa.data.length !== wb.data.length) {
                    throw new Error("Tensor data mismatch during merge.");
                }

                const outData = new Array(wa.data.length);
                for (let i = 0; i < wa.data.length; i++) {
                    outData[i] = (Number(wa.data[i]) + Number(wb.data[i])) * 0.5;
                }

                merged.push({
                    shape: wa.shape.slice(),
                    data: outData,
                });
            }

            return merged;
        }

        _blendWeightPayload(baseWeights, teacherWeights, teacherFactor) {
            if (!Array.isArray(baseWeights) || !Array.isArray(teacherWeights) || !baseWeights.length || !teacherWeights.length) {
                throw new Error("Cannot blend empty weight payloads.");
            }
            if (baseWeights.length !== teacherWeights.length) {
                throw new Error("Weight payload size mismatch.");
            }

            const factor = Number.isFinite(teacherFactor)
                ? Math.max(0, Math.min(1, teacherFactor))
                : 0;
            const keep = 1 - factor;

            const blended = [];
            for (let idx = 0; idx < baseWeights.length; idx++) {
                const base = baseWeights[idx];
                const teacher = teacherWeights[idx];
                if (!base || !teacher || !Array.isArray(base.shape) || !Array.isArray(teacher.shape)) {
                    throw new Error("Malformed tensor in blend payload.");
                }

                const shapeBase = JSON.stringify(base.shape);
                const shapeTeacher = JSON.stringify(teacher.shape);
                if (shapeBase !== shapeTeacher) {
                    throw new Error("Tensor shape mismatch during blend.");
                }

                if (!Array.isArray(base.data) || !Array.isArray(teacher.data) || base.data.length !== teacher.data.length) {
                    throw new Error("Tensor data mismatch during blend.");
                }

                const outData = new Array(base.data.length);
                for (let i = 0; i < base.data.length; i++) {
                    outData[i] = (Number(base.data[i]) * keep) + (Number(teacher.data[i]) * factor);
                }

                blended.push({
                    shape: base.shape.slice(),
                    data: outData,
                });
            }

            return blended;
        }

        _serializeMergedWeights() {
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;

            try {
                if (p1 && p2) {
                    return this._averageWeightPayload(p1._serializeWeights(), p2._serializeWeights());
                }
                if (p2) return p2._serializeWeights();
                if (p1) return p1._serializeWeights();
            } catch (err) {
                console.warn("Merged weight serialization failed:", err);
            }

            return [];
        }

        _buildCombinedExportPayload() {
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;
            const sharedEpsilon = (() => {
                let sum = 0;
                let count = 0;
                if (p1) { sum += p1.epsilon; count++; }
                if (p2) { sum += p2.epsilon; count++; }
                return count ? sum / count : 1.0;
            })();

            return {
                version: 2,
                mode: this.matchMode,
                savedAt: Date.now(),
                mergeCount: this.stats.mergeCount,
                combined: {
                    epsilon: sharedEpsilon,
                    weights: this._serializeMergedWeights(),
                },
                agents: {
                    p1: p1 ? {
                        epsilon: p1.epsilon,
                        storageKey: p1.storageKey,
                        weights: p1._serializeWeights(),
                    } : null,
                    p2: p2 ? {
                        epsilon: p2.epsilon,
                        storageKey: p2.storageKey,
                        weights: p2._serializeWeights(),
                    } : null,
                },
                telemetry: {
                    rounds: this.stats.rounds,
                    p1Good: this.stats.slots.p1.goodEvents,
                    p1Mistakes: this.stats.slots.p1.mistakeEvents,
                    p2Good: this.stats.slots.p2.goodEvents,
                    p2Mistakes: this.stats.slots.p2.mistakeEvents,
                },
            };
        }

        _saveCombinedPayload(weightsOverride, epsilonOverride) {
            try {
                const p1 = this.agents.p1;
                const p2 = this.agents.p2;
                let eps = Number(epsilonOverride);
                if (!Number.isFinite(eps)) {
                    let sum = 0;
                    let count = 0;
                    if (p1) { sum += p1.epsilon; count++; }
                    if (p2) { sum += p2.epsilon; count++; }
                    eps = count ? (sum / count) : 1.0;
                }

                const payload = {
                    version: 2,
                    mode: this.matchMode,
                    mergeCount: this.stats.mergeCount,
                    savedAt: Date.now(),
                    combined: {
                        epsilon: eps,
                        weights: Array.isArray(weightsOverride) ? weightsOverride : this._serializeMergedWeights(),
                    },
                    agents: {
                        p1: p1 ? {
                            epsilon: p1.epsilon,
                            storageKey: p1.storageKey,
                            memory: p1.memory.length,
                            onlineLoss: p1.lastOnlineLoss,
                            replayLoss: p1.lastLoss,
                            retrainLoss: p1.lastRetrainLoss,
                        } : null,
                        p2: p2 ? {
                            epsilon: p2.epsilon,
                            storageKey: p2.storageKey,
                            memory: p2.memory.length,
                            onlineLoss: p2.lastOnlineLoss,
                            replayLoss: p2.lastLoss,
                            retrainLoss: p2.lastRetrainLoss,
                        } : null,
                    },
                };

                localStorage.setItem(STORAGE_KEYS.combined, JSON.stringify(payload));
                this.stats.lastMergeAt = payload.savedAt;
                return true;
            } catch (err) {
                console.warn("Combined save failed:", err);
                return false;
            }
        }

        _mergeAgentsIntoSharedModel() {
            const p1 = this.agents.p1;
            const p2 = this.agents.p2;
            if (!p1 || !p2) return false;

            try {
                const p1Weights = p1._serializeWeights();
                const p2Weights = p2._serializeWeights();
                const mergedWeights = this._averageWeightPayload(p1Weights, p2Weights);

                const mergedEpsilon = (p1.epsilon + p2.epsilon) * 0.5;

                this.stats.mergeCount += 1;
                this._saveCombinedPayload(mergedWeights, mergedEpsilon);
                this._recordDualArchiveSnapshot(mergedWeights, mergedEpsilon);

                // Keep both agents distinct but let each absorb a light slice of shared knowledge.
                if (DUAL_KNOWLEDGE_SHARE_BLEND > 0) {
                    const p1Blended = this._blendWeightPayload(p1Weights, mergedWeights, DUAL_KNOWLEDGE_SHARE_BLEND);
                    const p2Blended = this._blendWeightPayload(p2Weights, mergedWeights, DUAL_KNOWLEDGE_SHARE_BLEND);
                    p1._applySerializedWeights(p1Blended);
                    p2._applySerializedWeights(p2Blended);
                    p1.saveToLocalStorage();
                    p2.saveToLocalStorage();
                }

                const blendPct = Math.round(DUAL_KNOWLEDGE_SHARE_BLEND * 100);
                this.panel.setStatus(`Round combined: shared snapshot saved + ${blendPct}% cross-learning blend.`);
                this._refreshMenuTelemetry();
                return true;
            } catch (err) {
                console.warn("Agent merge failed:", err);
                this.panel.setStatus("Combine step failed; continuing independent training.");
                return false;
            }
        }

    _focusGameplayInput() {
        const canvas = document.getElementById("gameCanvas");
        if (canvas) {
            canvas.setAttribute("tabindex", "-1");
            try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
        }
        const ae = document.activeElement;
        if (ae && ae !== document.body && typeof ae.blur === "function") {
            ae.blur();
        }
    }

    _setSpeed(speed, source) {
        const normalized = speed === 5 || speed === 10 ? speed : 1;
        this.speed = normalized;
        this.panel.setSpeed(normalized);

        if (source !== "menu" && this._menuControls.speed) {
            this._menuControls.speed.value = String(normalized);
        }

        this._refreshMenuTelemetry();
    }

    _bindMenuControls() {
        const enabledEl = document.getElementById("aiTrainingEnabled");
        const speedEl = document.getElementById("aiTrainingSpeed");
        const archiveMixChanceEl = document.getElementById("aiArchiveMixChance");
        const archiveMixFactorEl = document.getElementById("aiArchiveMixFactor");
        const matchupRandomizeChanceEl = document.getElementById("aiMatchupRandomizeChance");
        const stageRandomizeChanceEl = document.getElementById("aiStageRandomizeChance");

        this._menuTelemetryEls.p1Learning = document.getElementById("aiP1Learning");
        this._menuTelemetryEls.p1Saving = document.getElementById("aiP1Saving");
        this._menuTelemetryEls.p2Learning = document.getElementById("aiP2Learning");
        this._menuTelemetryEls.p2Saving = document.getElementById("aiP2Saving");
        this._menuTelemetryEls.combinedLearning = document.getElementById("aiCombinedLearning");
        this._menuTelemetryEls.combinedSaving = document.getElementById("aiCombinedSaving");

        this._menuControls.enabled = enabledEl;
        this._menuControls.speed = speedEl;
        this._menuControls.archiveMixChance = archiveMixChanceEl;
        this._menuControls.archiveMixFactor = archiveMixFactorEl;
        this._menuControls.matchupRandomizeChance = matchupRandomizeChanceEl;
        this._menuControls.stageRandomizeChance = stageRandomizeChanceEl;

        if (enabledEl) {
            this.trainingEnabled = !!enabledEl.checked;
            enabledEl.addEventListener("change", () => {
                this.trainingEnabled = !!enabledEl.checked;

                if (!this.trainingEnabled) {
                    const liveGame = this.activeGame && this.activeGame._running
                        ? this.activeGame
                        : null;
                    if (liveGame) {
                        this.detach(liveGame);
                        this.activeGame = liveGame;
                    } else if (this.activeGame) {
                        this.detach(this.activeGame);
                    }
                    this.panel.setVisible(false);
                    this.panel.setStatus("AI trainer disabled in menu.");
                    return;
                }

                if (this.activeGame && this.activeGame._running) {
                    this.attachIfEligible(this.activeGame);
                }
            });
        }

        if (speedEl) {
            const syncSpeed = () => {
                const nextSpeed = parseInt(speedEl.value, 10) || 1;
                this._setSpeed(nextSpeed, "menu");
            };
            syncSpeed();
            speedEl.addEventListener("change", syncSpeed);
        } else {
            this._setSpeed(1, "menu");
        }

        const clampChance = (raw, fallback) => {
            const text = typeof raw === "string" ? raw.trim() : "";
            if (!text.length) return clamp01(fallback);
            const n = Number(text);
            if (!Number.isFinite(n)) return clamp01(fallback);
            return clamp01(n);
        };

        const syncCurriculum = () => {
            this._curriculumCfg.archiveMixChance = clampChance(
                archiveMixChanceEl ? archiveMixChanceEl.value : NaN,
                DUAL_ARCHIVE_MIX_CHANCE
            );
            this._curriculumCfg.archiveMixFactor = clampChance(
                archiveMixFactorEl ? archiveMixFactorEl.value : NaN,
                DUAL_ARCHIVE_MIX_FACTOR
            );
            this._curriculumCfg.matchupRandomizeChance = clampChance(
                matchupRandomizeChanceEl ? matchupRandomizeChanceEl.value : NaN,
                DUAL_RANDOMIZE_MATCHUP_CHANCE
            );
            this._curriculumCfg.stageRandomizeChance = clampChance(
                stageRandomizeChanceEl ? stageRandomizeChanceEl.value : NaN,
                DUAL_RANDOMIZE_STAGE_CHANCE
            );

            if (archiveMixChanceEl) archiveMixChanceEl.value = this._curriculumCfg.archiveMixChance.toFixed(2);
            if (archiveMixFactorEl) archiveMixFactorEl.value = this._curriculumCfg.archiveMixFactor.toFixed(2);
            if (matchupRandomizeChanceEl) matchupRandomizeChanceEl.value = this._curriculumCfg.matchupRandomizeChance.toFixed(2);
            if (stageRandomizeChanceEl) stageRandomizeChanceEl.value = this._curriculumCfg.stageRandomizeChance.toFixed(2);

            this._refreshMenuTelemetry();
        };

        syncCurriculum();
        if (archiveMixChanceEl) archiveMixChanceEl.addEventListener("change", syncCurriculum);
        if (archiveMixFactorEl) archiveMixFactorEl.addEventListener("change", syncCurriculum);
        if (matchupRandomizeChanceEl) matchupRandomizeChanceEl.addEventListener("change", syncCurriculum);
        if (stageRandomizeChanceEl) stageRandomizeChanceEl.addEventListener("change", syncCurriculum);

        this._refreshMenuTelemetry();
    }

    _formatTime(ts) {
        if (!Number.isFinite(ts) || ts <= 0) return "not saved";
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return "not saved";
        return d.toLocaleTimeString();
    }

    _storageSizeBytes(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? raw.length : 0;
        } catch (_) {
            return 0;
        }
    }

    _formatBytes(bytes) {
        const b = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    }

    _refreshMenuTelemetry() {
        const p1 = this.agents.p1;
        const p2 = this.agents.p2;
        const s1 = this.stats.slots.p1;
        const s2 = this.stats.slots.p2;
        const p1Manual = this._isP1HumanOverride(this.activeGame);

        const p1Learn = this._menuTelemetryEls.p1Learning;
        const p1Save = this._menuTelemetryEls.p1Saving;
        const p2Learn = this._menuTelemetryEls.p2Learning;
        const p2Save = this._menuTelemetryEls.p2Saving;
        const cLearn = this._menuTelemetryEls.combinedLearning;
        const cSave = this._menuTelemetryEls.combinedSaving;

        if (p1Learn) {
            const eps = p1 ? p1.epsilon.toFixed(3) : "n/a";
            const mem = p1 ? p1.memory.length : 0;
            const online = p1 ? p1.lastOnlineLoss.toFixed(4) : "0.0000";
            const batches = p1 ? p1.totalTrainBatches : 0;
            const score = Number.isFinite(s1.currentEpisodeReward) ? s1.currentEpisodeReward.toFixed(2) : "0.00";
            const modeLabel = p1Manual ? "manual P1 control (paused)" : "active";
            p1Learn.textContent = `Learning: ${modeLabel} | eps ${eps} | score ${score} | mem ${mem} | batches ${batches} | good ${s1.goodEvents} | mistakes ${s1.mistakeEvents} | online ${online}`;
        }
        if (p1Save) {
            p1Save.textContent = `Saving: ${STORAGE_KEYS.p1} | ${this._formatBytes(this._storageSizeBytes(STORAGE_KEYS.p1))} | last ${this._formatTime(p1 ? p1.lastSavedAt : 0)}`;
        }

        if (p2Learn) {
            const eps = p2 ? p2.epsilon.toFixed(3) : "n/a";
            const mem = p2 ? p2.memory.length : 0;
            const online = p2 ? p2.lastOnlineLoss.toFixed(4) : "0.0000";
            const batches = p2 ? p2.totalTrainBatches : 0;
            const score = Number.isFinite(s2.currentEpisodeReward) ? s2.currentEpisodeReward.toFixed(2) : "0.00";
            p2Learn.textContent = `Learning: eps ${eps} | score ${score} | mem ${mem} | batches ${batches} | good ${s2.goodEvents} | mistakes ${s2.mistakeEvents} | online ${online}`;
        }
        if (p2Save) {
            p2Save.textContent = `Saving: ${STORAGE_KEYS.p2} | ${this._formatBytes(this._storageSizeBytes(STORAGE_KEYS.p2))} | last ${this._formatTime(p2 ? p2.lastSavedAt : 0)}`;
        }

        if (cLearn) {
            const epsP1 = p1 ? p1.epsilon.toFixed(3) : "n/a";
            const epsP2 = p2 ? p2.epsilon.toFixed(3) : "n/a";
            const cfg = this._curriculumCfg;
            const p1Mode = p1Manual ? "P1 HUMAN" : "P1 AI";
            cLearn.textContent = `Combined learning: artifact from P1/P2 + ${Math.round(DUAL_KNOWLEDGE_SHARE_BLEND * 100)}% cross-share | rounds ${this.stats.rounds} | combines ${this.stats.mergeCount} | ${p1Mode} | source eps P1 ${epsP1}, P2 ${epsP2} | mixChance ${cfg.archiveMixChance.toFixed(2)} mixFactor ${cfg.archiveMixFactor.toFixed(2)} matchup ${cfg.matchupRandomizeChance.toFixed(2)} stage ${cfg.stageRandomizeChance.toFixed(2)}`;
        }
        if (cSave) {
            cSave.textContent = `Combined saving: ${STORAGE_KEYS.combined} | ${this._formatBytes(this._storageSizeBytes(STORAGE_KEYS.combined))} | last ${this._formatTime(this.stats.lastMergeAt)}`;
        }
    }

    _refreshPanelStats() {
        const activeKeys = this._activeSlotKeys();
        const p1 = this.agents.p1;
        const p2 = this.agents.p2;
        const canToggleP1 = this.matchMode === "dual"
            && !!(this.activeGame && this.activeGame._qlearnData);
        const p1Manual = canToggleP1 && this._isP1HumanOverride(this.activeGame);
        let epsTotal = 0;
        let epsCount = 0;
        let winRateSum = 0;
        let avgRewardSum = 0;

        for (const key of activeKeys) {
            const slotStats = this.stats.slots[key];
            const agent = this.agents[key];

            if (agent) {
                epsTotal += agent.epsilon;
                epsCount += 1;
            }

            if (slotStats) {
                const wr = slotStats.episodes > 0 ? (slotStats.wins / slotStats.episodes) * 100 : 0;
                winRateSum += wr;

                const rewards = slotStats.rewardLast20;
                const avg = rewards.length
                    ? (rewards.reduce((a, b) => a + b, 0) / rewards.length)
                    : 0;
                avgRewardSum += avg;
            }
        }

        const epsilon = epsCount > 0 ? (epsTotal / epsCount) : 0;
        const winRate = activeKeys.length > 0 ? (winRateSum / activeKeys.length) : 0;
        const avgReward = activeKeys.length > 0 ? (avgRewardSum / activeKeys.length) : 0;
        const p1Score = this.matchMode === "dual"
            ? this.stats.slots.p1.currentEpisodeReward
            : Number.NaN;
        const p2Score = this.stats.slots.p2.currentEpisodeReward;
        const epsilonLabel = this.matchMode === "dual"
            ? `P1 ${p1 ? p1.epsilon.toFixed(3) : "n/a"} | P2 ${p2 ? p2.epsilon.toFixed(3) : "n/a"}`
            : "";

        this.panel.updateStats({
            episode: this.stats.rounds,
            epsilon,
            epsilonLabel,
            p1Score,
            p2Score,
            winRate,
            avgReward,
        });

        this.panel.setEpsilonOverrideState(
            this._epsilonOverride.active,
            !!this._epsilonOverride.snapshot
        );
        this.panel.setP1ControlState(p1Manual, canToggleP1);

        this._refreshMenuTelemetry();
    }

    _getPlayer(game, port) {
        if (!game || !Array.isArray(game.players)) return null;
        return game.players.find((p) => p.port === port) || null;
    }

    _getDamageLikeValue(f) {
        if (!f) return 0;
        if (f.maxStaminaHP > 0) {
            return Math.max(0, (f.maxStaminaHP || 0) - (f.staminaHP || 0));
        }
        return Math.max(0, f.damagePercent || 0);
    }

    _isFighterOnMap(game, fighter) {
        if (!game || !fighter || !fighter.isAlive) return false;
        const bz = game.stage && game.stage.blastZone;
        if (!bz) return true;

        const cx = (fighter.x || 0) + (fighter.width || 0) * 0.5;
        const cy = (fighter.y || 0) + (fighter.height || 0) * 0.5;
        return cx >= bz.x && cx <= bz.x + bz.w && cy >= bz.y && cy <= bz.y + bz.h;
    }

    _getSimStepCount() {
        if (this.speed >= 10) return 8;
        if (this.speed >= 5) return 4;
        return 1;
    }

    _getTrainStride() {
        if (this.speed >= 10) return 4;
        if (this.speed >= 5) return 2;
        return 1;
    }

    _snapshot(game) {
        const p1 = this._getPlayer(game, 0);
        const p2 = this._getPlayer(game, 1);
        const f1 = p1 && p1.fighter;
        const f2 = p2 && p2.fighter;

        return {
            p1Damage: this._getDamageLikeValue(f1),
            p2Damage: this._getDamageLikeValue(f2),
            p1Stocks: f1 ? f1.stocks : 0,
            p2Stocks: f2 ? f2.stocks : 0,
            p1LastHitBy: f1 && Number.isFinite(f1._lastHitBy) ? f1._lastHitBy : null,
            p2LastHitBy: f2 && Number.isFinite(f2._lastHitBy) ? f2._lastHitBy : null,
        };
    }

    _didPortWin(game, port) {
        const me = this._getPlayer(game, port);
        const enemy = this._getPlayer(game, port === 0 ? 1 : 0);

        if (!me || !enemy) return false;

        if (game.gameMode === "team" && Number.isFinite(game._winTeam) && me.fighter) {
            return me.fighter.team >= 0 && me.fighter.team === game._winTeam;
        }

        if (game._winner && Number.isFinite(game._winner.port)) {
            return game._winner.port === port;
        }

        return !!(me.fighter && me.fighter.isAlive && enemy.fighter && !enemy.fighter.isAlive);
    }

    _scheduleAutoRestart(game) {
        if (this.matchMode !== "dual") return;

        const data = game._qlearnData;
        if (!data) return;

        this._clearRestartTimer(game);

        const delayMs = this.speed > 1 ? 0 : 1000;
        const restartNow = () => {
            if (!game._running) return;
            if (game.state !== "gameover") return;

            this._prepareDualCurriculumForNextRound(game);
            game._restart();
            game.state = "countdown";
        };

        if (delayMs <= 0) {
            restartNow();
            return;
        }

        data.restartTimer = setTimeout(restartNow, delayMs);
    }

    _clearRestartTimer(game) {
        if (!game || !game._qlearnData) return;
        if (game._qlearnData.restartTimer) {
            clearTimeout(game._qlearnData.restartTimer);
            game._qlearnData.restartTimer = null;
        }
    }

    _finalizeEpisode(game, won) {
        const outcomes = Array.isArray(won) ? won : [];
        if (!outcomes.length) return;

        const retrainBatchesPerRound = this.matchMode === "dual"
            ? DUAL_ROUND_RETRAIN_BATCHES
            : 42;

        this.stats.rounds += 1;

        const retrainPromises = [];
        const roundRewards = [];

        for (const out of outcomes) {
            const slotKey = out.slotKey;
            const slotStats = this.stats.slots[slotKey];
            const slotAgent = this.agents[slotKey];
            if (!slotStats || !slotAgent) continue;

            slotStats.episodes += 1;
            if (out.won) slotStats.wins += 1;

            let epReward = slotStats.currentEpisodeReward;
            const epCombat = slotStats.episodeCombat;

            const totalCombatDamage = epCombat.dealtDamage + epCombat.takenDamage;
            if (totalCombatDamage < 8) {
                epReward += REWARD_CFG.noCombatRoundPenalty;
            } else if (epCombat.dealtDamage < 6) {
                epReward += REWARD_CFG.lowPressureRoundPenalty;
            }

            if (epCombat.selfDestructs > 0) {
                epReward += epCombat.selfDestructs * REWARD_CFG.selfDestructRoundPenalty;
            }

            slotStats.lastRoundReward = epReward;

            roundRewards.push(epReward);

            slotStats.rewardLast20.push(epReward);
            slotStats.rewardLast50.push(epReward);
            while (slotStats.rewardLast20.length > 20) slotStats.rewardLast20.shift();
            while (slotStats.rewardLast50.length > 50) slotStats.rewardLast50.shift();

            slotStats.currentEpisodeReward = 0;
            slotStats.episodeCombat = this._newEpisodeCombat();
            slotStats.combatStallTicks = 0;

            slotAgent.finishEpisode({
                won: out.won,
                reward: epReward,
                dealtDamage: epCombat.dealtDamage,
                takenDamage: epCombat.takenDamage,
                selfFalls: epCombat.selfFalls,
                enemyFalls: epCombat.enemyFalls,
                selfDestructs: epCombat.selfDestructs,
            });

            slotAgent.saveToLocalStorage();
            slotStats.lastSavedAt = slotAgent.lastSavedAt || Date.now();

            retrainPromises.push(
                slotAgent.retrainAfterRound(retrainBatchesPerRound)
                    .then((batches) => {
                        if (batches > 0) slotAgent.saveToLocalStorage();
                        slotStats.lastSavedAt = slotAgent.lastSavedAt || Date.now();
                    })
                    .catch((err) => {
                        console.warn(`Round retrain failed for ${slotKey}:`, err);
                    })
            );
        }

        const roundAvg = roundRewards.length
            ? (roundRewards.reduce((a, b) => a + b, 0) / roundRewards.length)
            : 0;
        this.stats.rewardLast50.push(roundAvg);
        while (this.stats.rewardLast50.length > 50) this.stats.rewardLast50.shift();

        this.panel.drawRewardGraph(this.stats.rewardLast50);
        this._refreshPanelStats();

        if (this.matchMode === "dual") {
            this.panel.setStatus("Round finished. Retraining both AIs and building combined snapshot...");
        } else {
            const p2Result = outcomes.find((x) => x.slotKey === "p2");
            const wonP2 = !!(p2Result && p2Result.won);
            this.panel.setStatus(wonP2
                ? "Round finished: P2 win. Retraining..."
                : "Round finished: P2 loss. Retraining...");
        }

        Promise.allSettled(retrainPromises).then(() => {
            if (this.matchMode === "dual") {
                if (this._isP1HumanOverride(game)) {
                    const p2Agent = this.agents.p2;
                    if (p2Agent) {
                        this._saveCombinedPayload(p2Agent._serializeWeights(), p2Agent.epsilon);
                    } else {
                        this._saveCombinedPayload();
                    }
                    this.panel.setStatus("P1 is human-controlled: skipped dual merge, saved P2 snapshot.");
                } else {
                    this._mergeAgentsIntoSharedModel();
                }
            } else {
                this._saveCombinedPayload();
            }
            this._refreshPanelStats();

            // Auto-restart is intentionally dual-only and waits for retraining to finish.
            if (this.matchMode === "dual") {
                this._scheduleAutoRestart(game);
            }
        });
    }

    attachIfEligible(game) {
        if (game) this.activeGame = game;
        if (game && game._qlearnData) return;

        const p1Agent = this.agents.p1;
        const p2Agent = this.agents.p2;
        if ((!p1Agent && !p2Agent) || !game || !Array.isArray(game.players)) {
            if (!p1Agent && !p2Agent) this.panel.setStatus("No TensorFlow backend available.");
            return;
        }

        if (!this.trainingEnabled) {
            this.panel.setVisible(false);
            return;
        }

        const p1 = this._getPlayer(game, 0);
        const p2 = this._getPlayer(game, 1);

        if (!p1 || !p2) {
            this.panel.setVisible(false);
            return;
        }

        const mode = game._settings && game._settings.qLearningMode === "dual-self-play"
            ? "dual"
            : "single";
        this.matchMode = mode;

        // Blueprint policy: training should happen only in dedicated dual self-play.
        if (mode !== "dual") {
            this.panel.setVisible(false);
            return;
        }

        this._rewarmDualExplorationIfNeeded();

        const slots = [];

        if (mode === "dual") {
            const p1Original = p1.controller;
            const p2Original = p2.controller;

            const p1Controller = new QLearningController(this.agents.p1, game, 0, 1);
            const p2Controller = new QLearningController(this.agents.p2, game, 1, 0);
            p1.controller = p1Controller;
            p2.controller = p2Controller;

            slots.push({
                key: "p1",
                selfPort: 0,
                enemyPort: 1,
                controller: p1Controller,
                aiController: p1Controller,
                isHumanOverride: false,
                originalController: p1Original,
                agent: this.agents.p1,
            });
            slots.push({
                key: "p2",
                selfPort: 1,
                enemyPort: 0,
                controller: p2Controller,
                aiController: p2Controller,
                originalController: p2Original,
                agent: this.agents.p2,
            });
        } else {
            if (!p2.isAI) {
                this.panel.setVisible(false);
                return;
            }

            const originalController = p2.controller;
            const qController = new QLearningController(this.agents.p2, game, 1, 0);
            p2.controller = qController;

            slots.push({
                key: "p2",
                selfPort: 1,
                enemyPort: 0,
                controller: qController,
                originalController,
                agent: this.agents.p2,
            });
        }

        game._qlearnData = {
            mode,
            slots,
            restartTimer: null,
            renderCounter: 0,
            simStepCounter: 0,
        };

        this.panel.setVisible(true);
        this.panel.setSpeed(this.speed);
        this._refreshPanelStats();
        this.panel.setStatus(mode === "dual"
            ? "Dual-agent self-play active (P1 + P2 learning)."
            : "Q-learning active for Player 2.");

        this.panel.setP1ControlState(false, mode === "dual");

        const canvas = document.getElementById("gameCanvas");
        this.panel.repositionNearCanvas(canvas);
    }

    detach(game) {
        if (!game) return;
        if (!game._qlearnData) {
            if (this.activeGame === game) this.activeGame = null;
            return;
        }

        const data = game._qlearnData;
        const slots = Array.isArray(data.slots) ? data.slots : [];

        for (const slot of slots) {
            const player = this._getPlayer(game, slot.selfPort);
            if (player && slot.originalController) {
                player.controller = slot.originalController;
            }
        }

        this._clearRestartTimer(game);
        delete game._qlearnData;

        if (this.activeGame === game) {
            this.activeGame = null;
            this.panel.setVisible(false);
            this.panel.setP1ControlState(false, false);
        }
    }

    shouldSkipRender(game) {
        if (!game || !game._qlearnData) return false;
        if (this.speed <= 1) return false;

        const data = game._qlearnData;
        data.renderCounter = (data.renderCounter || 0) + 1;
        const skipMod = this.speed >= 10 ? 4 : 2;
        return (data.renderCounter % skipMod) !== 0;
    }

    _trainSlotStep(game, slot, beforeSnap, afterSnap, ended, shouldTrainNow) {
        if (!slot || !slot.agent || !slot.controller || !beforeSnap || !afterSnap) return null;

        const selfPort = slot.selfPort;
        const enemyPort = slot.enemyPort;
        const slotKey = slot.key;
        const agent = slot.agent;
        const ctrl = slot.controller;
        const slotStats = this.stats.slots[slotKey];
        if (!slotStats) return null;

        const selfPlayer = this._getPlayer(game, selfPort);
        const enemyPlayer = this._getPlayer(game, enemyPort);
        const selfFighter = selfPlayer && selfPlayer.fighter;
        const enemyFighter = enemyPlayer && enemyPlayer.fighter;
        if (!selfFighter || !enemyFighter) {
            return { slotKey, won: false, reward: 0 };
        }

        const selfDamageBefore = selfPort === 0 ? beforeSnap.p1Damage : beforeSnap.p2Damage;
        const selfDamageAfter = selfPort === 0 ? afterSnap.p1Damage : afterSnap.p2Damage;
        const enemyDamageBefore = selfPort === 0 ? beforeSnap.p2Damage : beforeSnap.p1Damage;
        const enemyDamageAfter = selfPort === 0 ? afterSnap.p2Damage : afterSnap.p1Damage;

        const selfStocksBefore = selfPort === 0 ? beforeSnap.p1Stocks : beforeSnap.p2Stocks;
        const selfStocksAfter = selfPort === 0 ? afterSnap.p1Stocks : afterSnap.p2Stocks;
        const enemyStocksBefore = selfPort === 0 ? beforeSnap.p2Stocks : beforeSnap.p1Stocks;
        const enemyStocksAfter = selfPort === 0 ? afterSnap.p2Stocks : afterSnap.p1Stocks;

        const selfLastHitByBefore = selfPort === 0 ? beforeSnap.p1LastHitBy : beforeSnap.p2LastHitBy;

        const action = ctrl.lastAction;
        let reward = 0;

        const dealtDamage = Math.max(0, enemyDamageAfter - enemyDamageBefore);
        const takenDamage = Math.max(0, selfDamageAfter - selfDamageBefore);
        const selfFalls = Math.max(0, selfStocksBefore - selfStocksAfter);
        const enemyFalls = Math.max(0, enemyStocksBefore - enemyStocksAfter);
        const hadCombatInteraction = dealtDamage > 0 || takenDamage > 0;

        const combat = slotStats.episodeCombat;
        combat.dealtDamage += dealtDamage;
        combat.takenDamage += takenDamage;
        combat.selfFalls += selfFalls;
        combat.enemyFalls += enemyFalls;

        reward += dealtDamage * REWARD_CFG.damageToEnemy;
        reward += takenDamage * REWARD_CFG.damageTaken;
        reward += enemyFalls * REWARD_CFG.enemyFall;

        if (hadCombatInteraction) {
            slotStats.combatStallTicks = 0;
            if (dealtDamage > 0) reward += REWARD_CFG.combatHitBonus;
        } else {
            slotStats.combatStallTicks += 1;
            const stallPenalty = Math.max(
                REWARD_CFG.combatStallMaxPenalty,
                slotStats.combatStallTicks * REWARD_CFG.combatStallTickPenalty
            );
            reward += stallPenalty;
        }

        const dx = (enemyFighter.x || 0) - (selfFighter.x || 0);
        const dy = (enemyFighter.y || 0) - (selfFighter.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 280) reward += REWARD_CFG.closeCombatBonus;
        if (dist > 520) reward += REWARD_CFG.distancePenalty;

        if (action === ACTIONS.ATTACK && dist < 360) reward += REWARD_CFG.attackIntentBonus;
        if (action === ACTIONS.IDLE && dist < 420) reward += REWARD_CFG.idlePenalty;
        if (action === ACTIONS.ATTACK && dealtDamage <= 0 && dist > 420) reward += REWARD_CFG.farWhiffPenalty;

        const movingToward = (action === ACTIONS.MOVE_RIGHT && dx > 0) || (action === ACTIONS.MOVE_LEFT && dx < 0);
        const movingAway = (action === ACTIONS.MOVE_RIGHT && dx < 0) || (action === ACTIONS.MOVE_LEFT && dx > 0);
        if (dist < 700 && movingToward) reward += REWARD_CFG.moveTowardBonus;
        if (dist < 700 && movingAway) reward += REWARD_CFG.moveAwayPenalty;

        const blast = game.stage && game.stage.blastZone;
        if (blast) {
            const selfCx = (selfFighter.x || 0) + (selfFighter.width || 0) * 0.5;
            const selfCy = (selfFighter.y || 0) + (selfFighter.height || 0) * 0.5;

            const leftDist = selfCx - blast.x;
            const rightDist = (blast.x + blast.w) - selfCx;
            const topDist = selfCy - blast.y;
            const bottomDist = (blast.y + blast.h) - selfCy;

            const edgeDistX = Math.min(leftDist, rightDist);
            const edgeDistY = Math.min(topDist, bottomDist);
            const nearEdge = edgeDistX < 190 || edgeDistY < 130;

            if (nearEdge) {
                reward += REWARD_CFG.edgeDangerPenalty;

                const centerX = blast.x + blast.w * 0.5;
                const movingToCenter =
                    (action === ACTIONS.MOVE_LEFT && selfCx > centerX) ||
                    (action === ACTIONS.MOVE_RIGHT && selfCx < centerX);
                if (movingToCenter) {
                    reward += REWARD_CFG.edgeCenteringBonus;
                }

                const riskyJump = action === ACTIONS.JUMP && (edgeDistX < 150 || topDist < 120);
                if (riskyJump) {
                    reward += REWARD_CFG.edgeJumpRiskPenalty;
                }
            }
        }

        if (selfFalls > 0) {
            const wasThrownOff = selfLastHitByBefore !== null && selfLastHitByBefore !== selfPort;
            reward += selfFalls * REWARD_CFG.selfStockBase;
            reward += selfFalls * (wasThrownOff
                ? REWARD_CFG.selfStockThrownAdjustment
                : REWARD_CFG.selfStockSelfDestructAdjustment);

            const banked = Math.max(0, slotStats.currentEpisodeReward);
            const bankPenalty = Math.min(2500, banked * REWARD_CFG.selfStockBankPenaltyRatio) * selfFalls;
            reward -= bankPenalty;

            if (!wasThrownOff) {
                const sdBankPenalty = Math.min(3200, banked * REWARD_CFG.selfDestructBankPenaltyRatio) * selfFalls;
                reward -= sdBankPenalty;
                combat.selfDestructs += selfFalls;
            }
        }

        if (selfFighter && selfFighter.isAlive) {
            reward += this._isFighterOnMap(game, selfFighter)
                ? REWARD_CFG.stayOnMap
                : REWARD_CFG.offMap;
        }

        const won = ended ? this._didPortWin(game, selfPort) : false;
        if (ended) reward += won ? REWARD_CFG.winRound : REWARD_CFG.loseRound;

        const state = ctrl.lastState;
        const nextState = ctrl.peekNextState();
        if (Array.isArray(state) && state.length === 8) {
            agent.remember(state, action, reward, nextState, ended);
            if (shouldTrainNow) {
                agent.trainImmediate(state, action, reward, nextState, ended);
                agent.replay();
            }
        }

        slotStats.currentEpisodeReward += reward;
        if (reward > 0.25) slotStats.goodEvents += 1;
        if (reward < -0.25) slotStats.mistakeEvents += 1;

        return { slotKey, won, reward };
    }

    afterUpdateStep(game, beforeSnap, preState) {
        if (!game || !game._qlearnData || !beforeSnap) return;
        const data = game._qlearnData;
        if (!Array.isArray(data.slots) || data.slots.length === 0) return;

        if (preState !== "playing") return;

        const afterSnap = this._snapshot(game);
        if (!afterSnap) return;

        const ended = game.state === "gameover";
        const trainStride = this._getTrainStride();
        data.simStepCounter = (data.simStepCounter || 0) + 1;
        const shouldTrainNow = (data.simStepCounter % trainStride) === 0;

        const outcomes = [];
        let hadRewardChange = false;

        for (const slot of data.slots) {
            const result = this._trainSlotStep(game, slot, beforeSnap, afterSnap, ended, shouldTrainNow);
            if (!result) continue;
            outcomes.push(result);
            if (Math.abs(result.reward) > 0.000001) {
                hadRewardChange = true;
            }
        }

        if (hadRewardChange) {
            this._refreshPanelStats();
        }

        if (ended && outcomes.length) {
            this._finalizeEpisode(game, outcomes);
        }

        this._panelTick++;
        if (this._panelTick % 8 === 0) {
            const canvas = document.getElementById("gameCanvas");
            this.panel.repositionNearCanvas(canvas);
        }
    }
}

function readStorageJSONSafe(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function loadBestLearnedWeightsIntoAgent(agent, preferredSlot) {
    if (!agent) return false;

    // Prefer the combined artifact, then per-agent snapshots.
    const combinedPayload = readStorageJSONSafe(STORAGE_KEYS.combined);
    if (combinedPayload && combinedPayload.combined && Array.isArray(combinedPayload.combined.weights)) {
        try {
            agent._applySerializedWeights(combinedPayload.combined.weights);
            return true;
        } catch (err) {
            console.warn("Failed to apply combined learned snapshot:", err);
        }
    }

    const preferredFirst = preferredSlot === "p1"
        ? [STORAGE_KEYS.p1, STORAGE_KEYS.p2, LEGACY_STORAGE_KEY]
        : [STORAGE_KEYS.p2, STORAGE_KEYS.p1, LEGACY_STORAGE_KEY];

    for (const key of preferredFirst) {
        const payload = readStorageJSONSafe(key);
        if (!payload || !Array.isArray(payload.weights)) continue;

        try {
            agent._applySerializedWeights(payload.weights);
            return true;
        } catch (err) {
            console.warn(`Failed to apply learned snapshot from ${key}:`, err);
        }
    }

    return false;
}

function getOrCreateFightLearnedAgent(preferredSlot) {
    const slot = preferredSlot === "p1" ? "p1" : "p2";
    if (!SMASH.__fightLearnedAgents) SMASH.__fightLearnedAgents = {};

    let agent = SMASH.__fightLearnedAgents[slot];
    if (agent) return agent;

    agent = new QAgent({
        id: `LEARNED-${slot.toUpperCase()}-FIGHT`,
        storageKey: `smash3_qagent_learned_fight_cache_${slot}`,
        exportFilename: slot === "p1" ? EXPORT_FILENAMES.p1 : EXPORT_FILENAMES.p2,
    });

    // Inference-only fight agents must never overwrite training checkpoints.
    if (agent._saveHandle) {
        clearInterval(agent._saveHandle);
        agent._saveHandle = null;
    }
    agent.saveToLocalStorage = () => false;

    SMASH.__fightLearnedAgents[slot] = agent;
    return agent;
}

function createLearnedAIController(game, selfPort, fallbackEnemyPort, options) {
    const opts = options || {};
    const preferredSlot = (opts.preferredSlot === "p1" || opts.preferredSlot === "p2")
        ? opts.preferredSlot
        : (selfPort % 2 === 0 ? "p1" : "p2");

    const agent = getOrCreateFightLearnedAgent(preferredSlot);
    const loaded = loadBestLearnedWeightsIntoAgent(agent, preferredSlot);
    if (!loaded) {
        console.warn("No learned snapshot found for learned_ai; using current in-memory weights.");
    }

    const evalEpsilon = Number.isFinite(opts.epsilon)
        ? Math.max(0, Math.min(1, opts.epsilon))
        : LEARNED_AI_EVAL_EPSILON;
    agent.epsilon = Math.max(agent.epsilonMin, Math.min(agent.epsilonMax, evalEpsilon));

    return new QLearningController(agent, game, selfPort, fallbackEnemyPort);
}

function installRuntimePatches() {
    if (!SMASH.Game || !SMASH.Game.prototype) return;
    if (SMASH.__qlearningPatched) return;

    const runtime = new QTrainingRuntime();

    const proto = SMASH.Game.prototype;
    const origStart = proto.start;
    const origStop = proto.stop;
    const origUpdate = proto._update;
    const origRender = proto._render;

    proto.start = function () {
        runtime.attachIfEligible(this);
        return origStart.call(this);
    };

    proto.stop = function () {
        runtime.detach(this);
        if (runtime.activeGame === this) runtime.activeGame = null;
        return origStop.call(this);
    };

    proto._update = function (dt) {
        if (!this._qlearnData) {
            return origUpdate.call(this, dt);
        }

        const steps = runtime._getSimStepCount();
        let result;
        for (let i = 0; i < steps; i++) {
            const preState = this.state;
            const beforeSnap = runtime._snapshot(this);
            result = origUpdate.call(this, dt);

            try {
                runtime.afterUpdateStep(this, beforeSnap, preState);
            } catch (err) {
                console.error("Q-learning runtime error; trainer disabled for this match.", err);
                runtime.panel.setStatus("Trainer paused due to runtime error.");
                runtime.detach(this);
                break;
            }

            if (!this._running || this.state === "gameover") break;
        }

        return result;
    };

    proto._render = function () {
        if (runtime.shouldSkipRender(this)) return;
        return origRender.call(this);
    };

    window.addEventListener("resize", () => {
        const canvas = document.getElementById("gameCanvas");
        runtime.panel.repositionNearCanvas(canvas);
    });

    SMASH.__qlearningPatched = true;
    SMASH.__qlearningRuntime = runtime;
    SMASH.QAgent = QAgent;
    SMASH.createLearnedAIController = createLearnedAIController;

    console.log("SMASH Q-learning trainer loaded.");
}

installRuntimePatches();

})();
