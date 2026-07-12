const config = require('../../../config.json');
const { verificationChallenges } = require('./verificationChallengesConfig');
let database;

function getDatabase() {
    if (!database) {
        database = require('../../../Warden/db/database');
    }

    return database;
}

const DEFAULT_GUILD_ID = 'global';
const CHALLENGE_META_QUESTION_ID = '__challenge__';
const ALLOWED_IMAGE_ROLES = new Set(['solution', 'control', 'center', 'outer']);
const ALLOWED_IMAGE_DIRECTION_DEGREES = new Set([0, 45, 90, 135, 180, 225, 270, 315]);
const VERIFICATION_MODES = {
    challenge: 'challenge',
    halt: 'halt',
    oneClick: 'one-click',
};
const VALID_VERIFICATION_MODES = Object.values(VERIFICATION_MODES);
const DEFAULT_CHALLENGE_EXPIRY_SECONDS = 10 * 60;
const DEFAULT_COOLDOWN_SECONDS = 60;
const DEFAULT_AUTOKICK_SECONDS = 10 * 60;
const settingsCache = new Map();
let guildSettingsTableReady;
let challengeConfigTableReady;
let settingsTablesReady;

function normalizeGuildId(guildId) {
    return String(guildId ?? DEFAULT_GUILD_ID);
}

function safeParseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;

    try {
        return JSON.parse(value);
    }
    catch (err) {
        console.error('Failed to parse verification settings JSON:', err);
        return fallback;
    }
}

function stringifyJsonOrNull(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value) && value.length < 1) return null;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length < 1) return null;
    return JSON.stringify(value);
}

function normalizeActiveChallengeIds(value) {
    const rawChallengeIds = Array.isArray(value)
        ? value
        : safeParseJson(value, String(value ?? '').split(/[\s,]+/));

    const challengeIds = (Array.isArray(rawChallengeIds) ? rawChallengeIds : [rawChallengeIds])
        .map((challengeId) => String(challengeId ?? '').trim())
        .filter(Boolean);

    return [...new Set(challengeIds)];
}

function normalizeVerificationMode(mode, fallback = VERIFICATION_MODES.challenge) {
    if (VALID_VERIFICATION_MODES.includes(mode)) {
        return mode;
    }

    return fallback;
}

function normalizeTimerSeconds(value, fallback) {
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
}

function normalizeNullableTimerSeconds(value) {
    if (value === null || value === undefined || value === '') return null;
    const seconds = Math.floor(Number(value));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function normalizeBoolean(value) {
    return value === true || value === 1 || value === '1';
}

function defaultVerificationSettings() {
    const verificationConfig = config.Warden?.verification ?? {};
    const activeChallengeIds = normalizeActiveChallengeIds(
        verificationConfig.activeChallengeIds
        ?? verificationConfig.activeChallengeId
        ?? verificationConfig.challengeId
        ?? verificationConfig.activeCaptchaId
        ?? verificationConfig.captchaId
        ?? 'placeholder',
    );

    return {
        mode: normalizeVerificationMode(verificationConfig.mode, VERIFICATION_MODES.challenge),
        activeChallengeIds: activeChallengeIds.length > 0 ? activeChallengeIds : ['placeholder'],
        challengeExpirySeconds: normalizeTimerSeconds(verificationConfig.challengeExpirySeconds ?? verificationConfig.expirySeconds, DEFAULT_CHALLENGE_EXPIRY_SECONDS),
        cooldownSeconds: normalizeTimerSeconds(verificationConfig.cooldownSeconds, DEFAULT_COOLDOWN_SECONDS),
        autokickEnabled: verificationConfig.autokickEnabled === true,
        autokickSeconds: normalizeTimerSeconds(verificationConfig.autokickSeconds ?? verificationConfig.autokickTimerSeconds, DEFAULT_AUTOKICK_SECONDS),
        challengeOverrides: {},
    };
}

function normalizeString(value) {
    const normalizedValue = String(value ?? '').trim();
    return normalizedValue || undefined;
}

function normalizeStringArray(value) {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
    return [...new Set(values.map(normalizeString).filter(Boolean))];
}

function normalizeDirectionList(value) {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
    return [...new Set(values
        .map((degrees) => Number(degrees) === 360 ? 0 : Number(degrees))
        .filter((degrees) => Number.isInteger(degrees) && ALLOWED_IMAGE_DIRECTION_DEGREES.has(degrees)))]
        .sort((left, right) => left - right);
}

function normalizeImageDirections(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce((directions, [imageId, degreeList]) => {
        const normalizedImageId = normalizeString(imageId);
        const normalizedDegrees = normalizeDirectionList(degreeList);
        if (normalizedImageId && normalizedDegrees.length > 0) {
            directions[normalizedImageId] = normalizedDegrees;
        }
        return directions;
    }, {});
}

function normalizeImageIds(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce((imageIds, [role, ids]) => {
        if (!ALLOWED_IMAGE_ROLES.has(role)) return imageIds;
        const normalizedIds = normalizeStringArray(ids);
        if (normalizedIds.length > 0) {
            imageIds[role] = normalizedIds;
        }
        return imageIds;
    }, {});
}

function normalizeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeQuestionOverride(questionOverride = {}) {
    const normalizedQuestion = {};
    const label = normalizeString(questionOverride.label);
    const text = normalizeString(questionOverride.text);

    if (label) normalizedQuestion.label = label;
    if (text) normalizedQuestion.text = text;
    if (questionOverride.separateStep !== undefined) normalizedQuestion.separateStep = normalizeBoolean(questionOverride.separateStep);

    const generatedImageInput = normalizeObject(questionOverride.generatedImage);
    const generatedImage = {};
    if (generatedImageInput.enabled !== undefined) generatedImage.enabled = normalizeBoolean(generatedImageInput.enabled);
    if (normalizeString(generatedImageInput.type)) generatedImage.type = normalizeString(generatedImageInput.type);
    if (normalizeString(generatedImageInput.text)) generatedImage.text = normalizeString(generatedImageInput.text);
    if (normalizeString(generatedImageInput.imagePoolId)) generatedImage.imagePoolId = normalizeString(generatedImageInput.imagePoolId);
    if (generatedImageInput.gallerySize !== undefined) {
        const gallerySize = Math.floor(Number(generatedImageInput.gallerySize));
        if (Number.isInteger(gallerySize) && gallerySize > 0) generatedImage.gallerySize = gallerySize;
    }
    if (generatedImageInput.compositeImageGallery !== undefined) generatedImage.compositeImageGallery = normalizeBoolean(generatedImageInput.compositeImageGallery);
    if (generatedImageInput.solutionImageCount && typeof generatedImageInput.solutionImageCount === 'object') generatedImage.solutionImageCount = generatedImageInput.solutionImageCount;
    if (generatedImageInput.controlImageCount && typeof generatedImageInput.controlImageCount === 'object') generatedImage.controlImageCount = generatedImageInput.controlImageCount;
    if (generatedImageInput.maxControlImageRepeats !== undefined) {
        const repeats = Math.floor(Number(generatedImageInput.maxControlImageRepeats));
        if (Number.isInteger(repeats) && repeats > 0) generatedImage.maxControlImageRepeats = repeats;
    }

    const imageIds = normalizeImageIds(generatedImageInput.imageIds);
    const imageDirections = normalizeImageDirections(generatedImageInput.imageDirections);
    const config = normalizeObject(generatedImageInput.config);
    if (Object.keys(imageIds).length > 0) generatedImage.imageIds = imageIds;
    if (Object.keys(imageDirections).length > 0) generatedImage.imageDirections = imageDirections;
    if (Object.keys(config).length > 0) generatedImage.config = config;
    if (Object.keys(generatedImage).length > 0) normalizedQuestion.generatedImage = generatedImage;

    const answerInput = normalizeObject(questionOverride.answer);
    const answer = {};
    if (answerInput.required !== undefined) answer.required = normalizeBoolean(answerInput.required);
    if (normalizeString(answerInput.type)) answer.type = normalizeString(answerInput.type);
    if (normalizeString(answerInput.inputLabel)) answer.inputLabel = normalizeString(answerInput.inputLabel);
    if (normalizeString(answerInput.inputPlaceholder)) answer.inputPlaceholder = normalizeString(answerInput.inputPlaceholder);
    const accepted = normalizeStringArray(answerInput.accepted);
    if (accepted.length > 0) answer.accepted = accepted;
    if (Object.keys(answer).length > 0) normalizedQuestion.answer = answer;

    return normalizedQuestion;
}

function questionOverrideIsEmpty(questionOverride) {
    return Object.keys(normalizeQuestionOverride(questionOverride)).length < 1;
}

function normalizeChallengeOverrides(challengeOverrides) {
    if (!challengeOverrides || typeof challengeOverrides !== 'object' || Array.isArray(challengeOverrides)) return {};

    return Object.entries(challengeOverrides).reduce((normalizedOverrides, [challengeId, challengeOverride]) => {
        const normalizedChallengeId = normalizeString(challengeId);
        if (!normalizedChallengeId || !challengeOverride || typeof challengeOverride !== 'object') return normalizedOverrides;

        const normalizedChallenge = {};
        const title = normalizeString(challengeOverride.title);
        const description = normalizeString(challengeOverride.description);
        if (title) normalizedChallenge.title = title;
        if (description) normalizedChallenge.description = description;

        const questions = normalizeObject(challengeOverride.questions);
        const normalizedQuestions = Object.entries(questions).reduce((questionOverrides, [questionId, questionOverride]) => {
            const normalizedQuestionId = normalizeString(questionId);
            if (!normalizedQuestionId) return questionOverrides;
            const normalizedQuestion = normalizeQuestionOverride(questionOverride);
            if (Object.keys(normalizedQuestion).length > 0) {
                questionOverrides[normalizedQuestionId] = normalizedQuestion;
            }
            return questionOverrides;
        }, {});

        if (Object.keys(normalizedQuestions).length > 0) normalizedChallenge.questions = normalizedQuestions;
        if (normalizedChallenge.title || normalizedChallenge.description || Object.keys(normalizedQuestions).length > 0) {
            normalizedOverrides[normalizedChallengeId] = normalizedChallenge;
        }

        return normalizedOverrides;
    }, {});
}

function normalizeSettings(settings) {
    const defaults = defaultVerificationSettings();
    const activeChallengeIds = normalizeActiveChallengeIds(settings?.activeChallengeIds ?? defaults.activeChallengeIds);

    return {
        mode: normalizeVerificationMode(settings?.mode, defaults.mode),
        activeChallengeIds: activeChallengeIds.length > 0 ? activeChallengeIds : defaults.activeChallengeIds,
        challengeExpirySeconds: normalizeTimerSeconds(settings?.challengeExpirySeconds, defaults.challengeExpirySeconds),
        cooldownSeconds: normalizeTimerSeconds(settings?.cooldownSeconds, defaults.cooldownSeconds),
        autokickEnabled: normalizeBoolean(settings?.autokickEnabled),
        autokickSeconds: normalizeTimerSeconds(settings?.autokickSeconds, defaults.autokickSeconds),
        challengeOverrides: normalizeChallengeOverrides(settings?.challengeOverrides ?? defaults.challengeOverrides),
    };
}

function parseGuildSettingsRow(row) {
    return normalizeSettings({
        mode: row.mode,
        activeChallengeIds: safeParseJson(row.active_challenge_ids_json, []),
        challengeExpirySeconds: row.challenge_expiry_seconds,
        cooldownSeconds: row.cooldown_seconds,
        autokickEnabled: row.autokick_enabled,
        autokickSeconds: row.autokick_seconds,
        challengeOverrides: {},
    });
}

function getFirstPromptQuestion(challenge) {
    return (challenge?.questions ?? []).find((question) => question.generatedImage?.type === 'prompt-text')
        ?? (challenge?.questions ?? []).find((question) => question.answer?.type === 'text');
}

function getFirstGalleryQuestion(challenge) {
    return (challenge?.questions ?? []).find((question) => ['gallery-standard', 'gallery-rotation-alignment'].includes(question.generatedImage?.type));
}

function mapLegacyChallengeOverride(challengeId, legacyOverride) {
    const challenge = verificationChallenges[challengeId];
    if (!challenge || !legacyOverride || typeof legacyOverride !== 'object' || Array.isArray(legacyOverride)) return undefined;

    const challengeOverride = { questions: {} };
    if (normalizeString(legacyOverride.title)) challengeOverride.title = normalizeString(legacyOverride.title);
    if (normalizeString(legacyOverride.description)) challengeOverride.description = normalizeString(legacyOverride.description);

    const promptQuestion = getFirstPromptQuestion(challenge);
    const prompt = normalizeString(legacyOverride.prompt);
    const answers = normalizeStringArray(legacyOverride.answers);
    if (promptQuestion && (prompt || answers.length > 0)) {
        const questionOverride = challengeOverride.questions[promptQuestion.id] ?? {};
        if (prompt) {
            if (promptQuestion.generatedImage?.type === 'prompt-text') {
                questionOverride.generatedImage = {
                    ...(questionOverride.generatedImage ?? {}),
                    text: prompt,
                };
            }
            else {
                questionOverride.text = prompt;
            }
        }
        if (answers.length > 0) {
            questionOverride.answer = {
                ...(questionOverride.answer ?? {}),
                accepted: answers,
            };
        }
        challengeOverride.questions[promptQuestion.id] = questionOverride;
    }

    const galleryQuestion = getFirstGalleryQuestion(challenge);
    if (galleryQuestion) {
        const primaryImageIds = normalizeStringArray(legacyOverride[`solution${'ImageIds'}`]);
        const decoyImageIds = normalizeStringArray(legacyOverride[`control${'ImageIds'}`]);
        const legacyImageDirections = normalizeImageDirections(legacyOverride[`solution${'ImageDirections'}`]);
        const imageIds = {};

        if (galleryQuestion.generatedImage?.type === 'gallery-rotation-alignment') {
            if (primaryImageIds.length > 0) imageIds.center = primaryImageIds;
            if (decoyImageIds.length > 0) imageIds.outer = decoyImageIds;
        }
        else {
            if (primaryImageIds.length > 0) imageIds.solution = primaryImageIds;
            if (decoyImageIds.length > 0) imageIds.control = decoyImageIds;
        }

        if (Object.keys(imageIds).length > 0 || Object.keys(legacyImageDirections).length > 0) {
            const questionOverride = challengeOverride.questions[galleryQuestion.id] ?? {};
            questionOverride.generatedImage = {
                ...(questionOverride.generatedImage ?? {}),
            };
            if (Object.keys(imageIds).length > 0) questionOverride.generatedImage.imageIds = imageIds;
            if (Object.keys(legacyImageDirections).length > 0) questionOverride.generatedImage.imageDirections = legacyImageDirections;
            challengeOverride.questions[galleryQuestion.id] = questionOverride;
        }
    }

    const normalized = normalizeChallengeOverrides({ [challengeId]: challengeOverride });
    return normalized[challengeId];
}

function normalizeLegacyChallengeOverrides(value) {
    const legacyOverrides = typeof value === 'string' ? safeParseJson(value, {}) : normalizeObject(value);
    if (!legacyOverrides || typeof legacyOverrides !== 'object' || Array.isArray(legacyOverrides)) return {};

    return Object.entries(legacyOverrides).reduce((challengeOverrides, [challengeId, legacyOverride]) => {
        const normalizedChallengeId = normalizeString(challengeId);
        const mappedOverride = mapLegacyChallengeOverride(normalizedChallengeId, legacyOverride);
        if (normalizedChallengeId && mappedOverride) {
            challengeOverrides[normalizedChallengeId] = mappedOverride;
        }
        return challengeOverrides;
    }, {});
}

function parseLegacySettingsRow(row) {
    return normalizeSettings({
        mode: row.mode,
        activeChallengeIds: normalizeActiveChallengeIds(row.active_challenge_ids_json ?? row.active_challenge_ids),
        challengeExpirySeconds: row.challenge_expiry_seconds ?? row.expiry_seconds,
        cooldownSeconds: row.cooldown_seconds,
        autokickEnabled: row.autokick_enabled,
        autokickSeconds: row.autokick_seconds ?? row.autokick_timer_seconds,
        challengeOverrides: normalizeLegacyChallengeOverrides(row[`challenge_${'overrides'}_json`]),
    });
}

async function legacyVerificationSettingsTableExists() {
    const rows = await getDatabase().query('SHOW TABLES LIKE ?', ['verification_settings']);
    return rows.length > 0;
}

async function getLegacyVerificationSettings(guildId) {
    const legacyTableExists = await legacyVerificationSettingsTableExists();
    if (!legacyTableExists) return undefined;

    const rows = await getDatabase().query(
        'SELECT * FROM verification_settings WHERE guild_id = ? LIMIT 1',
        [guildId],
    );

    if (rows.length < 1) return undefined;
    return parseLegacySettingsRow(rows[0]);
}

function normalizeQuestionOverrideRow(row) {
    const questionId = normalizeString(row.question_id);
    if (!questionId) return undefined;

    if (questionId === CHALLENGE_META_QUESTION_ID) {
        const meta = {};
        const title = normalizeString(row.title);
        const description = normalizeString(row.description);
        if (title) meta.title = title;
        if (description) meta.description = description;
        return { questionId, meta };
    }

    const imageConfig = normalizeObject(safeParseJson(row.image_config_json, {}));
    const generatedImage = {
        ...imageConfig,
    };

    if (row.generate_image !== null && row.generate_image !== undefined) generatedImage.enabled = normalizeBoolean(row.generate_image);
    if (normalizeString(row.generated_image_type)) generatedImage.type = normalizeString(row.generated_image_type);
    if (normalizeString(row.generated_image_text)) generatedImage.text = normalizeString(row.generated_image_text);

    const imageIds = normalizeImageIds(safeParseJson(row.image_ids_json, {}));
    const imageDirections = normalizeImageDirections(safeParseJson(row.image_directions_json, {}));
    if (Object.keys(imageIds).length > 0) generatedImage.imageIds = imageIds;
    if (Object.keys(imageDirections).length > 0) generatedImage.imageDirections = imageDirections;
    if (Object.keys(imageConfig).length > 0) generatedImage.config = imageConfig;

    const answer = {};
    if (row.answer_required !== null && row.answer_required !== undefined) answer.required = normalizeBoolean(row.answer_required);
    if (normalizeString(row.answer_type)) answer.type = normalizeString(row.answer_type);
    if (normalizeString(row.answer_input_label)) answer.inputLabel = normalizeString(row.answer_input_label);
    if (normalizeString(row.answer_input_placeholder)) answer.inputPlaceholder = normalizeString(row.answer_input_placeholder);
    const accepted = normalizeStringArray(safeParseJson(row.answers_json, []));
    if (accepted.length > 0) answer.accepted = accepted;

    const question = {};
    if (normalizeString(row.question_label)) question.label = normalizeString(row.question_label);
    if (normalizeString(row.question_text)) question.text = normalizeString(row.question_text);
    if (row.separate_step !== null && row.separate_step !== undefined) question.separateStep = normalizeBoolean(row.separate_step);
    if (Object.keys(generatedImage).length > 0) question.generatedImage = generatedImage;
    if (Object.keys(answer).length > 0) question.answer = answer;

    return { questionId, question: normalizeQuestionOverride(question) };
}

function normalizeChallengeConfigRows(rows) {
    return rows.reduce((challengeOverrides, row) => {
        const challengeId = normalizeString(row.challenge_id);
        if (!challengeId) return challengeOverrides;
        const normalizedRow = normalizeQuestionOverrideRow(row);
        if (!normalizedRow) return challengeOverrides;

        const challengeOverride = challengeOverrides[challengeId] ?? { questions: {} };
        if (normalizedRow.questionId === CHALLENGE_META_QUESTION_ID) {
            Object.assign(challengeOverride, normalizedRow.meta);
        }
        else if (!questionOverrideIsEmpty(normalizedRow.question)) {
            challengeOverride.questions[normalizedRow.questionId] = normalizedRow.question;
        }

        if (challengeOverride.title || challengeOverride.description || Object.keys(challengeOverride.questions).length > 0) {
            challengeOverrides[challengeId] = challengeOverride;
        }

        return challengeOverrides;
    }, {});
}

async function ensureVerificationGuildSettingsTable() {
    if (!guildSettingsTableReady) {
        guildSettingsTableReady = getDatabase().query(`
            CREATE TABLE IF NOT EXISTS verification_guild_settings (
                guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
                mode VARCHAR(16) NOT NULL DEFAULT 'challenge',
                active_challenge_ids_json TEXT NULL,
                challenge_expiry_seconds INT NULL DEFAULT NULL,
                cooldown_seconds INT NULL DEFAULT NULL,
                autokick_enabled TINYINT(1) NOT NULL DEFAULT 0,
                autokick_seconds INT NULL DEFAULT NULL,
                updated_by VARCHAR(32) NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `).catch((err) => {
            guildSettingsTableReady = undefined;
            throw err;
        });
    }

    return guildSettingsTableReady;
}

async function ensureVerificationChallengeConfigTable() {
    if (!challengeConfigTableReady) {
        challengeConfigTableReady = getDatabase().query(`
            CREATE TABLE IF NOT EXISTS verification_challenge_config (
                guild_id VARCHAR(32) NOT NULL,
                challenge_id VARCHAR(128) NOT NULL,
                question_id VARCHAR(128) NOT NULL DEFAULT '__challenge__',
                title TEXT NULL,
                description TEXT NULL,
                question_label VARCHAR(128) NULL,
                question_text TEXT NULL,
                separate_step TINYINT(1) NULL,
                generate_image TINYINT(1) NULL,
                generated_image_type VARCHAR(64) NULL,
                generated_image_text TEXT NULL,
                answer_required TINYINT(1) NULL,
                answer_type VARCHAR(64) NULL,
                answer_input_label VARCHAR(128) NULL,
                answer_input_placeholder VARCHAR(256) NULL,
                answers_json TEXT NULL,
                image_ids_json TEXT NULL,
                image_directions_json TEXT NULL,
                image_config_json TEXT NULL,
                updated_by VARCHAR(32) NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, challenge_id, question_id),
                INDEX idx_verification_challenge_config_challenge (guild_id, challenge_id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `).catch((err) => {
            challengeConfigTableReady = undefined;
            throw err;
        });
    }

    return challengeConfigTableReady;
}

async function ensureVerificationSettingsTables() {
    if (!settingsTablesReady) {
        settingsTablesReady = Promise.all([
            ensureVerificationGuildSettingsTable(),
            ensureVerificationChallengeConfigTable(),
        ]).catch((err) => {
            settingsTablesReady = undefined;
            throw err;
        });
    }

    return settingsTablesReady;
}

function questionConfigToRow(guildId, challengeId, questionId, question, updatedBy) {
    const generatedImage = question.generatedImage ?? {};
    const answer = question.answer ?? {};
    const imageConfig = { ...(generatedImage.config ?? {}) };

    for (const key of ['imagePoolId', 'gallerySize', 'compositeImageGallery', 'solutionImageCount', 'controlImageCount', 'maxControlImageRepeats']) {
        if (generatedImage[key] !== undefined) imageConfig[key] = generatedImage[key];
    }

    return [
        guildId,
        challengeId,
        questionId,
        null,
        null,
        question.label ?? null,
        question.text ?? null,
        question.separateStep === undefined ? null : (question.separateStep ? 1 : 0),
        generatedImage.enabled === undefined ? null : (generatedImage.enabled ? 1 : 0),
        generatedImage.type ?? null,
        generatedImage.text ?? null,
        answer.required === undefined ? null : (answer.required ? 1 : 0),
        answer.type ?? null,
        answer.inputLabel ?? null,
        answer.inputPlaceholder ?? null,
        stringifyJsonOrNull(answer.accepted),
        stringifyJsonOrNull(generatedImage.imageIds),
        stringifyJsonOrNull(generatedImage.imageDirections),
        stringifyJsonOrNull(imageConfig),
        updatedBy ? String(updatedBy) : null,
    ];
}

async function insertChallengeConfigRow(rowValues) {
    await getDatabase().query(
        `INSERT INTO verification_challenge_config (
            guild_id, challenge_id, question_id, title, description, question_label, question_text, separate_step,
            generate_image, generated_image_type, generated_image_text, answer_required, answer_type,
            answer_input_label, answer_input_placeholder, answers_json, image_ids_json, image_directions_json,
            image_config_json, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rowValues,
    );
}

async function saveVerificationSettings(guildId, settings, updatedBy) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedSettings = normalizeSettings(settings);

    await ensureVerificationSettingsTables();
    await getDatabase().query(
        `INSERT INTO verification_guild_settings (guild_id, mode, active_challenge_ids_json, challenge_expiry_seconds, cooldown_seconds, autokick_enabled, autokick_seconds, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            mode = VALUES(mode),
            active_challenge_ids_json = VALUES(active_challenge_ids_json),
            challenge_expiry_seconds = VALUES(challenge_expiry_seconds),
            cooldown_seconds = VALUES(cooldown_seconds),
            autokick_enabled = VALUES(autokick_enabled),
            autokick_seconds = VALUES(autokick_seconds),
            updated_by = VALUES(updated_by)`,
        [
            normalizedGuildId,
            normalizedSettings.mode,
            stringifyJsonOrNull(normalizedSettings.activeChallengeIds),
            normalizedSettings.challengeExpirySeconds,
            normalizedSettings.cooldownSeconds,
            normalizedSettings.autokickEnabled ? 1 : 0,
            normalizedSettings.autokickSeconds,
            updatedBy ? String(updatedBy) : null,
        ],
    );

    await getDatabase().query('DELETE FROM verification_challenge_config WHERE guild_id = ?', [normalizedGuildId]);

    for (const [challengeId, challengeOverride] of Object.entries(normalizedSettings.challengeOverrides)) {
        if (challengeOverride.title || challengeOverride.description) {
            await insertChallengeConfigRow([
                normalizedGuildId,
                challengeId,
                CHALLENGE_META_QUESTION_ID,
                challengeOverride.title ?? null,
                challengeOverride.description ?? null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                updatedBy ? String(updatedBy) : null,
            ]);
        }

        for (const [questionId, questionOverride] of Object.entries(challengeOverride.questions ?? {})) {
            if (!questionOverrideIsEmpty(questionOverride)) {
                await insertChallengeConfigRow(questionConfigToRow(normalizedGuildId, challengeId, questionId, questionOverride, updatedBy));
            }
        }
    }

    settingsCache.set(normalizedGuildId, normalizedSettings);
    return normalizedSettings;
}

async function getVerificationSettings(guildId) {
    const normalizedGuildId = normalizeGuildId(guildId);

    if (settingsCache.has(normalizedGuildId)) {
        return settingsCache.get(normalizedGuildId);
    }

    await ensureVerificationSettingsTables();
    const guildRows = await getDatabase().query(
        'SELECT mode, active_challenge_ids_json, challenge_expiry_seconds, cooldown_seconds, autokick_enabled, autokick_seconds FROM verification_guild_settings WHERE guild_id = ? LIMIT 1',
        [normalizedGuildId],
    );

    if (guildRows.length < 1) {
        const legacySettings = await getLegacyVerificationSettings(normalizedGuildId);
        if (legacySettings) {
            return saveVerificationSettings(normalizedGuildId, legacySettings, null);
        }

        return saveVerificationSettings(normalizedGuildId, defaultVerificationSettings(), null);
    }

    const configRows = await getDatabase().query(
        'SELECT * FROM verification_challenge_config WHERE guild_id = ? ORDER BY challenge_id, question_id',
        [normalizedGuildId],
    );
    const settings = normalizeSettings({
        ...parseGuildSettingsRow(guildRows[0]),
        challengeOverrides: normalizeChallengeConfigRows(configRows),
    });

    settingsCache.set(normalizedGuildId, settings);
    return settings;
}

async function setVerificationMode(guildId, mode, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, mode }, updatedBy);
}

async function setActiveChallengeIds(guildId, challengeIds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, activeChallengeIds: challengeIds }, updatedBy);
}

async function setChallengeExpirySeconds(guildId, challengeExpirySeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, challengeExpirySeconds }, updatedBy);
}

async function setCooldownSeconds(guildId, cooldownSeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, { ...currentSettings, cooldownSeconds }, updatedBy);
}

async function setAutokickSettings(guildId, autokickEnabled, autokickSeconds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    return saveVerificationSettings(guildId, {
        ...currentSettings,
        autokickEnabled,
        autokickSeconds: autokickSeconds ?? currentSettings.autokickSeconds,
    }, updatedBy);
}

function buildChallengeOverrideUpdate(currentSettings, challengeId, updateChallenge) {
    const normalizedChallengeId = normalizeString(challengeId);
    if (!normalizedChallengeId) return normalizeChallengeOverrides(currentSettings.challengeOverrides);

    const challengeOverrides = normalizeChallengeOverrides(currentSettings.challengeOverrides);
    const currentChallenge = challengeOverrides[normalizedChallengeId] ?? { questions: {} };
    const updatedChallenge = normalizeChallengeOverrides({
        [normalizedChallengeId]: updateChallenge({
            ...currentChallenge,
            questions: { ...(currentChallenge.questions ?? {}) },
        }),
    })[normalizedChallengeId];

    const updatedOverrides = { ...challengeOverrides };
    if (updatedChallenge) {
        updatedOverrides[normalizedChallengeId] = updatedChallenge;
    }
    else {
        delete updatedOverrides[normalizedChallengeId];
    }

    return updatedOverrides;
}

function buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, updateQuestion) {
    const normalizedQuestionId = normalizeString(questionId);
    return buildChallengeOverrideUpdate(currentSettings, challengeId, (challengeOverride) => {
        if (!normalizedQuestionId) return challengeOverride;
        const questions = { ...(challengeOverride.questions ?? {}) };
        const updatedQuestion = normalizeQuestionOverride(updateQuestion(questions[normalizedQuestionId] ?? {}));

        if (Object.keys(updatedQuestion).length > 0) {
            questions[normalizedQuestionId] = updatedQuestion;
        }
        else {
            delete questions[normalizedQuestionId];
        }

        return { ...challengeOverride, questions };
    });
}

async function setChallengeMetaOverride(guildId, challengeId, data, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildChallengeOverrideUpdate(currentSettings, challengeId, (currentChallenge) => ({
        ...currentChallenge,
        title: data?.title,
        description: data?.description,
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setQuestionTextOverride(guildId, challengeId, questionId, text, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => ({
        ...question,
        text,
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setQuestionImageTextOverride(guildId, challengeId, questionId, text, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => ({
        ...question,
        generatedImage: {
            ...(question.generatedImage ?? {}),
            text,
        },
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setQuestionAnswerOverrides(guildId, challengeId, questionId, answers, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => ({
        ...question,
        answer: {
            ...(question.answer ?? {}),
            accepted: answers,
        },
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setQuestionImageIds(guildId, challengeId, questionId, role, imageIds, updatedBy) {
    if (!ALLOWED_IMAGE_ROLES.has(role)) throw new Error(`Unsupported verification image role: ${role}`);
    const currentSettings = await getVerificationSettings(guildId);
    const normalizedImageIds = normalizeStringArray(imageIds);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => ({
        ...question,
        generatedImage: {
            ...(question.generatedImage ?? {}),
            imageIds: {
                ...(question.generatedImage?.imageIds ?? {}),
                [role]: normalizedImageIds,
            },
        },
    }));

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function clearQuestionImageIds(guildId, challengeId, questionId, role, updatedBy) {
    if (!ALLOWED_IMAGE_ROLES.has(role)) throw new Error(`Unsupported verification image role: ${role}`);
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => {
        const imageIds = { ...(question.generatedImage?.imageIds ?? {}) };
        delete imageIds[role];
        return {
            ...question,
            generatedImage: {
                ...(question.generatedImage ?? {}),
                imageIds,
            },
        };
    });

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function setQuestionImageDirections(guildId, challengeId, questionId, imageIds, degrees, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const normalizedImageIds = normalizeStringArray(imageIds);
    const normalizedDegrees = normalizeDirectionList(degrees);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => {
        const imageDirections = { ...(question.generatedImage?.imageDirections ?? {}) };
        for (const imageId of normalizedImageIds) {
            imageDirections[imageId] = normalizedDegrees;
        }
        return {
            ...question,
            generatedImage: {
                ...(question.generatedImage ?? {}),
                imageDirections,
            },
        };
    });

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function clearQuestionImageDirections(guildId, challengeId, questionId, imageIds, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const normalizedImageIds = normalizeStringArray(imageIds);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => {
        const imageDirections = { ...(question.generatedImage?.imageDirections ?? {}) };
        for (const imageId of normalizedImageIds) {
            delete imageDirections[imageId];
        }
        return {
            ...question,
            generatedImage: {
                ...(question.generatedImage ?? {}),
                imageDirections,
            },
        };
    });

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

async function clearQuestionOverrideField(guildId, challengeId, questionId, field, updatedBy) {
    const currentSettings = await getVerificationSettings(guildId);
    const challengeOverrides = buildQuestionOverrideUpdate(currentSettings, challengeId, questionId, (question) => {
        const updatedQuestion = { ...question, generatedImage: { ...(question.generatedImage ?? {}) }, answer: { ...(question.answer ?? {}) } };

        switch (field) {
            case 'label':
                delete updatedQuestion.label;
                break;
            case 'text':
                delete updatedQuestion.text;
                break;
            case 'separateStep':
                delete updatedQuestion.separateStep;
                break;
            case 'generatedImage.enabled':
                delete updatedQuestion.generatedImage.enabled;
                break;
            case 'generatedImage.type':
                delete updatedQuestion.generatedImage.type;
                break;
            case 'generatedImage.text':
                delete updatedQuestion.generatedImage.text;
                break;
            case 'generatedImage.imageIds':
                delete updatedQuestion.generatedImage.imageIds;
                break;
            case 'generatedImage.imageDirections':
                delete updatedQuestion.generatedImage.imageDirections;
                break;
            case 'generatedImage.config':
                delete updatedQuestion.generatedImage.config;
                break;
            case 'answer.required':
                delete updatedQuestion.answer.required;
                break;
            case 'answer.type':
                delete updatedQuestion.answer.type;
                break;
            case 'answer.inputLabel':
                delete updatedQuestion.answer.inputLabel;
                break;
            case 'answer.inputPlaceholder':
                delete updatedQuestion.answer.inputPlaceholder;
                break;
            case 'answer.accepted':
                delete updatedQuestion.answer.accepted;
                break;
            default:
                throw new Error(`Unsupported verification question override field: ${field}`);
        }

        if (Object.keys(updatedQuestion.generatedImage).length < 1) delete updatedQuestion.generatedImage;
        if (Object.keys(updatedQuestion.answer).length < 1) delete updatedQuestion.answer;
        return updatedQuestion;
    });

    return saveVerificationSettings(guildId, { ...currentSettings, challengeOverrides }, updatedBy);
}

module.exports = {
    VERIFICATION_MODES,
    VALID_VERIFICATION_MODES,
    DEFAULT_CHALLENGE_EXPIRY_SECONDS,
    DEFAULT_COOLDOWN_SECONDS,
    DEFAULT_AUTOKICK_SECONDS,
    CHALLENGE_META_QUESTION_ID,
    ALLOWED_IMAGE_ROLES,
    ALLOWED_IMAGE_DIRECTION_DEGREES,
    ensureVerificationGuildSettingsTable,
    ensureVerificationChallengeConfigTable,
    ensureVerificationSettingsTables,
    safeParseJson,
    stringifyJsonOrNull,
    normalizeActiveChallengeIds,
    normalizeQuestionOverrideRow,
    normalizeChallengeConfigRows,
    getVerificationSettings,
    saveVerificationSettings,
    setVerificationMode,
    setActiveChallengeIds,
    setChallengeExpirySeconds,
    setCooldownSeconds,
    setAutokickSettings,
    setChallengeMetaOverride,
    setQuestionTextOverride,
    setQuestionImageTextOverride,
    setQuestionAnswerOverrides,
    setQuestionImageIds,
    clearQuestionImageIds,
    setQuestionImageDirections,
    clearQuestionImageDirections,
    clearQuestionOverrideField,
};
