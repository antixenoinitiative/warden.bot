const { verificationChallenges } = require('./verificationChallenges/verificationChallengesConfig');
const { normalizeVerificationChallenge } = require('./verificationChallenges/verificationChallenges');
let database;

const DEFAULT_GUILD_ID = 'global';
const TEMPLATE_VERSION = 1;
const DEDICATED_TASK_KEYS = new Set(['enabled', 'type', 'text', 'imagePoolId', 'imageIds', 'imageDirections']);
const SETTINGS_TASK_KEYS = new Set([
    ...DEDICATED_TASK_KEYS,
    'gallerySize',
    'compositeImageGallery',
    'solutionImageCount',
    'controlImageCount',
    'maxControlImageRepeats',
    'config',
]);
const SEEDED_GUILD_CACHE_MAX = 100;
const MAX_ACTIVE_CATALOG_CHALLENGES = 25;
const catalogCache = new Map();
const seededGuilds = new Map();
const seedLoads = new Map();
let catalogTablesReady;

function getDatabase() {
    if (!database) {
        database = require('../../../Warden/db/database');
    }

    return database;
}

function defaultQuery(sql, values) {
    return getDatabase().query(sql, values);
}

function normalizeGuildId(guildId) {
    return String(guildId ?? DEFAULT_GUILD_ID);
}

function safeParseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;

    try {
        return JSON.parse(value);
    }
    catch (err) {
        console.error('Failed to parse verification challenge catalog JSON:', err);
        return fallback;
    }
}

function stringifyJsonOrNull(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value) && value.length < 1) return null;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length < 1) return null;
    return JSON.stringify(value);
}

function nullableBoolean(value) {
    if (value === null || value === undefined) return null;
    return Boolean(Number(value));
}

function booleanToTinyInt(value) {
    if (value === null || value === undefined) return null;
    return value ? 1 : 0;
}

async function withVerificationCatalogTransaction(callback) {
    const db = getDatabase();

    if (!db.pool?.getConnection) {
        await db.query('START TRANSACTION');
        try {
            const result = await callback((sql, values) => db.query(sql, values));
            await db.query('COMMIT');
            return result;
        }
        catch (err) {
            await db.query('ROLLBACK').catch((rollbackErr) => {
                console.error('Failed to roll back verification catalog transaction:', rollbackErr);
            });
            throw err;
        }
    }

    const connection = await new Promise((resolve, reject) => {
        db.pool.getConnection((err, conn) => {
            if (err) reject(err);
            else resolve(conn);
        });
    });
    const query = (sql, values) => new Promise((resolve, reject) => {
        connection.query(sql, values, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    try {
        await query('START TRANSACTION');
        const result = await callback(query);
        await query('COMMIT');
        return result;
    }
    catch (err) {
        await query('ROLLBACK').catch((rollbackErr) => {
            console.error('Failed to roll back verification catalog transaction:', rollbackErr);
        });
        throw err;
    }
    finally {
        connection.release();
    }
}

function pruneNullishObject(value) {
    return Object.fromEntries(
        Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined && entry !== null),
    );
}

function cloneCatalogValue(value) {
    if (Array.isArray(value)) return value.map(cloneCatalogValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneCatalogValue(entry)]));
    }
    return value;
}

function normalizeCatalogTimestamp(value) {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value?.toISOString === 'function') return value.toISOString();
    return String(value);
}

async function ensureVerificationChallengeCatalogTables() {
    if (!catalogTablesReady) {
        catalogTablesReady = Promise.all([
            getDatabase().query(`
                CREATE TABLE IF NOT EXISTS verification_challenge_catalog (
                    guild_id VARCHAR(32) NOT NULL,
                    challenge_id VARCHAR(128) NOT NULL,
                    source_type VARCHAR(32) NOT NULL DEFAULT 'admin',
                    source_template_id VARCHAR(128) NULL,
                    template_version INT NOT NULL DEFAULT 1,
                    protected_template TINYINT(1) NOT NULL DEFAULT 0,
                    title TEXT NULL,
                    description TEXT NULL,
                    color VARCHAR(32) NULL,
                    fields_json TEXT NULL,
                    enabled TINYINT(1) NOT NULL DEFAULT 0,
                    deleted_at TIMESTAMP NULL DEFAULT NULL,
                    created_by VARCHAR(32) NULL,
                    updated_by VARCHAR(32) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, challenge_id),
                    INDEX idx_verification_challenge_catalog_template (source_template_id),
                    INDEX idx_verification_challenge_catalog_deleted (deleted_at)
                ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            `),
            getDatabase().query(`
                CREATE TABLE IF NOT EXISTS verification_question_catalog (
                    guild_id VARCHAR(32) NOT NULL,
                    challenge_id VARCHAR(128) NOT NULL,
                    question_id VARCHAR(128) NOT NULL,
                    question_order INT NULL,
                    source_type VARCHAR(32) NOT NULL DEFAULT 'admin',
                    source_template_id VARCHAR(128) NULL,
                    template_version INT NOT NULL DEFAULT 1,
                    protected_template TINYINT(1) NOT NULL DEFAULT 0,
                    question_label VARCHAR(128) NULL,
                    question_text TEXT NULL,
                    separate_step TINYINT(1) NULL,
                    task_enabled TINYINT(1) NULL,
                    task_type VARCHAR(64) NULL,
                    task_prompt_text TEXT NULL,
                    task_image_pool_id VARCHAR(128) NULL,
                    task_image_ids_json TEXT NULL,
                    task_image_directions_json TEXT NULL,
                    task_config_json TEXT NULL,
                    answer_required TINYINT(1) NULL,
                    answer_type VARCHAR(64) NULL,
                    answer_input_label VARCHAR(128) NULL,
                    answer_input_placeholder VARCHAR(256) NULL,
                    answers_json TEXT NULL,
                    deleted_at TIMESTAMP NULL DEFAULT NULL,
                    created_by VARCHAR(32) NULL,
                    updated_by VARCHAR(32) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, challenge_id, question_id),
                    INDEX idx_verification_question_catalog_challenge (guild_id, challenge_id),
                    INDEX idx_verification_question_catalog_deleted (deleted_at)
                ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            `),
        ]).catch((err) => {
            catalogTablesReady = undefined;
            throw err;
        });
    }

    return catalogTablesReady;
}

function templateChallengeToCatalogRows(challenge, guildId = DEFAULT_GUILD_ID) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const challengeRow = {
        guild_id: normalizedGuildId,
        challenge_id: challenge.id,
        source_type: 'template',
        source_template_id: challenge.id,
        template_version: TEMPLATE_VERSION,
        protected_template: 1,
        title: challenge.title ?? null,
        description: challenge.description ?? null,
        color: challenge.color ?? null,
        fields_json: stringifyJsonOrNull(challenge.fields),
        enabled: challenge.enabled ? 1 : 0,
    };

    const questionRows = (challenge.questions ?? []).map((question, index) => {
        const generatedImage = question.generatedImage ?? {};
        const answer = question.answer ?? {};
        const taskConfig = Object.fromEntries(Object.entries(generatedImage).filter(([key]) => !DEDICATED_TASK_KEYS.has(key)));

        return {
            guild_id: normalizedGuildId,
            challenge_id: challenge.id,
            question_id: question.id,
            question_order: index + 1,
            source_type: 'template',
            source_template_id: question.id,
            template_version: TEMPLATE_VERSION,
            protected_template: 1,
            question_label: question.label ?? null,
            question_text: question.text ?? null,
            separate_step: booleanToTinyInt(question.separateStep),
            task_enabled: booleanToTinyInt(generatedImage.enabled),
            task_type: generatedImage.type ?? null,
            task_prompt_text: generatedImage.text ?? null,
            task_image_pool_id: generatedImage.imagePoolId ?? null,
            task_image_ids_json: stringifyJsonOrNull(generatedImage.imageIds),
            task_image_directions_json: stringifyJsonOrNull(generatedImage.imageDirections),
            task_config_json: stringifyJsonOrNull(taskConfig),
            answer_required: booleanToTinyInt(answer.required),
            answer_type: answer.type ?? null,
            answer_input_label: answer.inputLabel ?? null,
            answer_input_placeholder: answer.inputPlaceholder ?? null,
            answers_json: stringifyJsonOrNull(answer.accepted),
        };
    });

    return { challengeRow, questionRows };
}

async function insertChallengeRowIfMissing(row, query = defaultQuery) {
    await query(`
        INSERT IGNORE INTO verification_challenge_catalog (
            guild_id, challenge_id, source_type, source_template_id, template_version, protected_template,
            title, description, color, fields_json, enabled, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'seed')
    `, [row.guild_id, row.challenge_id, row.source_type, row.source_template_id, row.template_version, row.protected_template, row.title, row.description, row.color, row.fields_json, row.enabled]);
}

async function insertQuestionRowIfMissing(row, query = defaultQuery) {
    await query(`
        INSERT IGNORE INTO verification_question_catalog (
            guild_id, challenge_id, question_id, question_order, source_type, source_template_id,
            template_version, protected_template, question_label, question_text, separate_step,
            task_enabled, task_type, task_prompt_text, task_image_pool_id, task_image_ids_json,
            task_image_directions_json, task_config_json, answer_required, answer_type,
            answer_input_label, answer_input_placeholder, answers_json, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'seed')
    `, [row.guild_id, row.challenge_id, row.question_id, row.question_order, row.source_type, row.source_template_id, row.template_version, row.protected_template, row.question_label, row.question_text, row.separate_step, row.task_enabled, row.task_type, row.task_prompt_text, row.task_image_pool_id, row.task_image_ids_json, row.task_image_directions_json, row.task_config_json, row.answer_required, row.answer_type, row.answer_input_label, row.answer_input_placeholder, row.answers_json]);
}

// Insert-only foundation helper for protected template rows. It intentionally
// preserves existing catalog values; use syncVerificationChallengeCatalogFromSettings
// when legacy settings should be mirrored into protected template rows.
async function seedVerificationChallengeTemplates(guildId, query) {
    const normalizedGuildId = normalizeGuildId(guildId);
    await ensureVerificationChallengeCatalogTables();

    for (const challenge of Object.values(verificationChallenges)) {
        const { challengeRow, questionRows } = templateChallengeToCatalogRows(challenge, normalizedGuildId);
        await insertChallengeRowIfMissing(challengeRow, query);
        for (const questionRow of questionRows) {
            await insertQuestionRowIfMissing(questionRow, query);
        }
    }

    clearVerificationChallengeCatalogCache(normalizedGuildId);
}

function markGuildTemplatesSeeded(guildId) {
    seededGuilds.delete(guildId);
    seededGuilds.set(guildId, true);
    while (seededGuilds.size > SEEDED_GUILD_CACHE_MAX) {
        seededGuilds.delete(seededGuilds.keys().next().value);
    }
}

// Template seeding is insert-only and only needs to run once per guild for a
// process version. Catalog snapshot expiry must not turn every read into a set
// of redundant INSERT IGNORE statements.
async function ensureVerificationChallengeTemplatesSeeded(guildId = DEFAULT_GUILD_ID, query = defaultQuery) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const canMemoize = query === defaultQuery;

    if (!canMemoize) return seedVerificationChallengeTemplates(normalizedGuildId, query);
    if (seededGuilds.has(normalizedGuildId)) {
        markGuildTemplatesSeeded(normalizedGuildId);
        return;
    }
    if (seedLoads.has(normalizedGuildId)) return seedLoads.get(normalizedGuildId);

    const load = seedVerificationChallengeTemplates(normalizedGuildId, query)
        .then(() => markGuildTemplatesSeeded(normalizedGuildId))
        .finally(() => seedLoads.delete(normalizedGuildId));
    seedLoads.set(normalizedGuildId, load);
    return load;
}

async function upsertProtectedTemplateChallengeRow(row, updatedBy = 'sync', query = defaultQuery) {
    const normalizedUpdatedBy = String(updatedBy ?? 'sync');
    // MySQL evaluates duplicate-key assignments from left to right. Compare the
    // current values before assigning replacements so unchanged rows retain their author.
    await query(`
        INSERT INTO verification_challenge_catalog (
            guild_id, challenge_id, source_type, source_template_id, template_version,
            protected_template, title, description, color, fields_json, enabled,
            created_by, updated_by
        ) VALUES (?, ?, 'template', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            updated_by = IF(
                source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL
                AND NOT (
                    title <=> VALUES(title)
                    AND description <=> VALUES(description)
                    AND color <=> VALUES(color)
                    AND fields_json <=> VALUES(fields_json)
                    AND enabled <=> VALUES(enabled)
                    AND source_template_id <=> VALUES(source_template_id)
                    AND template_version <=> VALUES(template_version)
                ),
                VALUES(updated_by),
                updated_by
            ),
            title = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(title), title),
            description = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(description), description),
            color = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(color), color),
            fields_json = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(fields_json), fields_json),
            enabled = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(enabled), enabled),
            source_template_id = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(source_template_id), source_template_id),
            template_version = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(template_version), template_version)
    `, [row.guild_id, row.challenge_id, row.source_template_id, row.template_version, row.title, row.description, row.color, row.fields_json, row.enabled, normalizedUpdatedBy, normalizedUpdatedBy]);
}

async function upsertProtectedTemplateQuestionRow(row, updatedBy = 'sync', query = defaultQuery) {
    const normalizedUpdatedBy = String(updatedBy ?? 'sync');
    // Keep updated_by first for the same pre-update comparison guarantee used above.
    await query(`
        INSERT INTO verification_question_catalog (
            guild_id, challenge_id, question_id, question_order, source_type, source_template_id,
            template_version, protected_template, question_label, question_text, separate_step,
            task_enabled, task_type, task_prompt_text, task_image_pool_id, task_image_ids_json,
            task_image_directions_json, task_config_json, answer_required, answer_type,
            answer_input_label, answer_input_placeholder, answers_json, created_by, updated_by
        ) VALUES (?, ?, ?, ?, 'template', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            updated_by = IF(
                source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL
                AND NOT (
                    question_order <=> VALUES(question_order)
                    AND question_label <=> VALUES(question_label)
                    AND question_text <=> VALUES(question_text)
                    AND separate_step <=> VALUES(separate_step)
                    AND task_enabled <=> VALUES(task_enabled)
                    AND task_type <=> VALUES(task_type)
                    AND task_prompt_text <=> VALUES(task_prompt_text)
                    AND task_image_pool_id <=> VALUES(task_image_pool_id)
                    AND task_image_ids_json <=> VALUES(task_image_ids_json)
                    AND task_image_directions_json <=> VALUES(task_image_directions_json)
                    AND task_config_json <=> VALUES(task_config_json)
                    AND answer_required <=> VALUES(answer_required)
                    AND answer_type <=> VALUES(answer_type)
                    AND answer_input_label <=> VALUES(answer_input_label)
                    AND answer_input_placeholder <=> VALUES(answer_input_placeholder)
                    AND answers_json <=> VALUES(answers_json)
                    AND source_template_id <=> VALUES(source_template_id)
                    AND template_version <=> VALUES(template_version)
                ),
                VALUES(updated_by),
                updated_by
            ),
            question_order = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(question_order), question_order),
            question_label = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(question_label), question_label),
            question_text = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(question_text), question_text),
            separate_step = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(separate_step), separate_step),
            task_enabled = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(task_enabled), task_enabled),
            task_type = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(task_type), task_type),
            task_prompt_text = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(task_prompt_text), task_prompt_text),
            task_image_pool_id = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(task_image_pool_id), task_image_pool_id),
            task_image_ids_json = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(task_image_ids_json), task_image_ids_json),
            task_image_directions_json = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(task_image_directions_json), task_image_directions_json),
            task_config_json = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(task_config_json), task_config_json),
            answer_required = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(answer_required), answer_required),
            answer_type = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(answer_type), answer_type),
            answer_input_label = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(answer_input_label), answer_input_label),
            answer_input_placeholder = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(answer_input_placeholder), answer_input_placeholder),
            answers_json = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(answers_json), answers_json),
            source_template_id = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(source_template_id), source_template_id),
            template_version = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(template_version), template_version)
    `, [row.guild_id, row.challenge_id, row.question_id, row.question_order, row.source_template_id, row.template_version, row.question_label, row.question_text, row.separate_step, row.task_enabled, row.task_type, row.task_prompt_text, row.task_image_pool_id, row.task_image_ids_json, row.task_image_directions_json, row.task_config_json, row.answer_required, row.answer_type, row.answer_input_label, row.answer_input_placeholder, row.answers_json, normalizedUpdatedBy, normalizedUpdatedBy]);
}

// Transition helper used by the one-time legacy bootstrap and full compatibility
// saves. Catalog-authoritative reads must not run this on every startup,
// otherwise stale legacy rows could overwrite newer catalog values.
async function syncVerificationChallengeCatalogFromSettings(guildId, verificationSettings, updatedBy = 'sync', query = defaultQuery) {
    const normalizedGuildId = normalizeGuildId(guildId);
    await ensureVerificationChallengeCatalogTables();
    await ensureVerificationChallengeTemplatesSeeded(normalizedGuildId, query);

    for (const staticChallenge of Object.values(verificationChallenges)) {
        const effectiveChallenge = normalizeVerificationChallenge(staticChallenge, verificationSettings);
        const { challengeRow, questionRows } = templateChallengeToCatalogRows(effectiveChallenge, normalizedGuildId);
        await upsertProtectedTemplateChallengeRow(challengeRow, updatedBy, query);
        for (const questionRow of questionRows) {
            await upsertProtectedTemplateQuestionRow(questionRow, updatedBy, query);
        }
    }

    clearVerificationChallengeCatalogCache(normalizedGuildId);
}

async function writeVerificationChallengeCatalogEntriesFromSettings({
    guildId,
    challengeId,
    verificationSettings,
    includeChallenge = false,
    questionIds = [],
    updatedBy = 'settings-save',
    query = defaultQuery,
}) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedChallengeId = String(challengeId ?? '').trim();
    const staticChallenge = verificationChallenges[normalizedChallengeId];
    if (!staticChallenge) {
        throw new Error(`Catalog-native writes currently require a protected template challenge: ${normalizedChallengeId || '(missing ID)'}`);
    }

    await ensureVerificationChallengeCatalogTables();

    const effectiveChallenge = normalizeVerificationChallenge(staticChallenge, verificationSettings);
    const { challengeRow, questionRows } = templateChallengeToCatalogRows(effectiveChallenge, normalizedGuildId);
    const rowsByQuestionId = new Map(questionRows.map((row) => [row.question_id, row]));
    const normalizedQuestionIds = [...new Set(questionIds.map((questionId) => String(questionId ?? '').trim()).filter(Boolean))];
    const missingQuestionId = normalizedQuestionIds.find((questionId) => !rowsByQuestionId.has(questionId));
    if (missingQuestionId) {
        throw new Error(`Unknown protected template verification question: ${normalizedChallengeId}/${missingQuestionId}`);
    }

    if (includeChallenge) {
        await upsertProtectedTemplateChallengeRow(challengeRow, updatedBy, query);
    }
    for (const questionId of normalizedQuestionIds) {
        await upsertProtectedTemplateQuestionRow(rowsByQuestionId.get(questionId), updatedBy, query);
    }

    clearVerificationChallengeCatalogCache(normalizedGuildId);
}

function catalogRowsToChallenge(challengeRow, questionRows = []) {
    const rowsWithIndex = questionRows.map((row, index) => ({ row, index }));
    rowsWithIndex.sort((a, b) => {
        const orderA = a.row.question_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.row.question_order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const idCompare = String(a.row.question_id).localeCompare(String(b.row.question_id));
        return idCompare || a.index - b.index;
    });

    return {
        id: challengeRow.challenge_id,
        sourceType: challengeRow.source_type,
        sourceTemplateId: challengeRow.source_template_id ?? undefined,
        templateVersion: Number(challengeRow.template_version) || undefined,
        protectedTemplate: Boolean(Number(challengeRow.protected_template)),
        enabled: Boolean(Number(challengeRow.enabled)),
        title: challengeRow.title ?? undefined,
        description: challengeRow.description ?? undefined,
        color: challengeRow.color ?? undefined,
        fields: safeParseJson(challengeRow.fields_json, undefined),
        questions: rowsWithIndex.map(({ row }) => catalogRowToQuestion(row)),
        createdBy: challengeRow.created_by ?? undefined,
        updatedBy: challengeRow.updated_by ?? undefined,
        createdAt: normalizeCatalogTimestamp(challengeRow.created_at),
        updatedAt: normalizeCatalogTimestamp(challengeRow.updated_at),
    };
}

function catalogRowToQuestion(row) {
    const taskConfig = safeParseJson(row.task_config_json, {});
    const generatedImage = pruneNullishObject({
        enabled: nullableBoolean(row.task_enabled),
        type: row.task_type ?? undefined,
        text: row.task_prompt_text ?? undefined,
        imagePoolId: row.task_image_pool_id ?? undefined,
        imageIds: safeParseJson(row.task_image_ids_json, undefined),
        imageDirections: safeParseJson(row.task_image_directions_json, undefined),
        ...taskConfig,
    });
    if (row.task_image_pool_id === null) generatedImage.imagePoolId = null;
    const answer = pruneNullishObject({
        required: nullableBoolean(row.answer_required),
        type: row.answer_type ?? undefined,
        inputLabel: row.answer_input_label ?? undefined,
        inputPlaceholder: row.answer_input_placeholder ?? undefined,
        accepted: safeParseJson(row.answers_json, undefined),
    });

    return {
        id: row.question_id,
        sourceType: row.source_type,
        sourceTemplateId: row.source_template_id ?? undefined,
        templateVersion: Number(row.template_version) || undefined,
        protectedTemplate: Boolean(Number(row.protected_template)),
        order: row.question_order ?? undefined,
        label: row.question_label ?? undefined,
        text: row.question_text ?? undefined,
        separateStep: nullableBoolean(row.separate_step),
        ...(Object.keys(generatedImage).length > 0 ? { generatedImage } : {}),
        ...(Object.keys(answer).length > 0 ? { answer } : {}),
        createdBy: row.created_by ?? undefined,
        updatedBy: row.updated_by ?? undefined,
        createdAt: normalizeCatalogTimestamp(row.created_at),
        updatedAt: normalizeCatalogTimestamp(row.updated_at),
    };
}

function questionToCatalogContentValues(question = {}) {
    const generatedImage = question.generatedImage ?? {};
    const answer = question.answer ?? {};
    const taskConfig = Object.fromEntries(
        Object.entries(generatedImage).filter(([key]) => !DEDICATED_TASK_KEYS.has(key)),
    );
    const numericOrder = Number(question.order);

    return [
        Number.isInteger(numericOrder) && numericOrder > 0 ? numericOrder : null,
        question.label ?? null,
        question.text ?? null,
        booleanToTinyInt(question.separateStep),
        booleanToTinyInt(generatedImage.enabled),
        generatedImage.type ?? null,
        generatedImage.text ?? null,
        generatedImage.imagePoolId ?? null,
        stringifyJsonOrNull(generatedImage.imageIds),
        stringifyJsonOrNull(generatedImage.imageDirections),
        stringifyJsonOrNull(taskConfig),
        booleanToTinyInt(answer.required),
        answer.type ?? null,
        answer.inputLabel ?? null,
        answer.inputPlaceholder ?? null,
        stringifyJsonOrNull(answer.accepted),
    ];
}

async function updateLockedChallengeRow(query, guildId, challengeId, challenge, updatedBy) {
    await query(`
        UPDATE verification_challenge_catalog
        SET title = ?, description = ?, color = ?, fields_json = ?, enabled = ?, updated_by = ?
        WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL
    `, [
        challenge.title ?? null,
        challenge.description ?? null,
        challenge.color ?? null,
        stringifyJsonOrNull(challenge.fields),
        challenge.enabled ? 1 : 0,
        String(updatedBy ?? 'admin'),
        guildId,
        challengeId,
    ]);
}

async function updateLockedQuestionRow(query, guildId, challengeId, questionId, question, updatedBy) {
    await query(`
        UPDATE verification_question_catalog
        SET question_order = ?, question_label = ?, question_text = ?, separate_step = ?,
            task_enabled = ?, task_type = ?, task_prompt_text = ?, task_image_pool_id = ?,
            task_image_ids_json = ?, task_image_directions_json = ?, task_config_json = ?,
            answer_required = ?, answer_type = ?, answer_input_label = ?,
            answer_input_placeholder = ?, answers_json = ?, updated_by = ?
        WHERE guild_id = ? AND challenge_id = ? AND question_id = ? AND deleted_at IS NULL
    `, [
        ...questionToCatalogContentValues(question),
        String(updatedBy ?? 'admin'),
        guildId,
        challengeId,
        questionId,
    ]);
}

async function resetProtectedQuestionRow(query, guildId, challengeId, question, updatedBy) {
    await query(`
        UPDATE verification_question_catalog
        SET question_order = ?, question_label = ?, question_text = ?, separate_step = ?,
            task_enabled = ?, task_type = ?, task_prompt_text = ?, task_image_pool_id = ?,
            task_image_ids_json = ?, task_image_directions_json = ?, task_config_json = ?,
            answer_required = ?, answer_type = ?, answer_input_label = ?,
            answer_input_placeholder = ?, answers_json = ?, source_type = 'template',
            source_template_id = ?, template_version = ?, protected_template = 1,
            deleted_at = NULL, updated_by = ?
        WHERE guild_id = ? AND challenge_id = ? AND question_id = ?
            AND source_type = 'template' AND protected_template = 1
    `, [
        ...questionToCatalogContentValues(question), question.id, TEMPLATE_VERSION,
        String(updatedBy ?? 'admin'), guildId, challengeId, question.id,
    ]);
}

async function resequenceLockedQuestionRows(query, guildId, challengeId, rows, updatedBy) {
    const ordered = [...rows].sort((left, right) => {
        const order = (Number(left.question_order) || Number.MAX_SAFE_INTEGER)
            - (Number(right.question_order) || Number.MAX_SAFE_INTEGER);
        return order || String(left.question_id).localeCompare(String(right.question_id));
    });
    for (const [index, row] of ordered.entries()) {
        if (Number(row.original_question_order ?? row.question_order) !== index + 1) {
            await query(`UPDATE verification_question_catalog SET question_order = ?, updated_by = ?
                WHERE guild_id = ? AND challenge_id = ? AND question_id = ? AND deleted_at IS NULL`,
            [index + 1, String(updatedBy ?? 'admin'), guildId, challengeId, row.question_id]);
        }
        row.question_order = index + 1;
    }
    return ordered;
}

function orderTemplateThenCustom(rows, template) {
    const templateOrder = new Map((template?.questions ?? []).map((question, index) => [String(question.id), index]));
    const protectedRows = rows.filter((row) => templateOrder.has(String(row.question_id)))
        .sort((left, right) => templateOrder.get(String(left.question_id)) - templateOrder.get(String(right.question_id)));
    const customRows = rows.filter((row) => !templateOrder.has(String(row.question_id)))
        .sort((left, right) => (Number(left.question_order) || Number.MAX_SAFE_INTEGER)
            - (Number(right.question_order) || Number.MAX_SAFE_INTEGER)
            || String(left.question_id).localeCompare(String(right.question_id)));
    return [...protectedRows, ...customRows].map((row, index) => ({ ...row,
        original_question_order: row.question_order, question_order: index + 1 }));
}

async function mutateVerificationChallengeCatalogEntry({ guildId, challengeId, updatedBy, mutate }) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedChallengeId = String(challengeId ?? '').trim();
    if (!normalizedChallengeId) throw new Error('Verification challenge ID is required.');
    if (normalizedChallengeId.length > 100) throw new Error('Verification challenge ID must be at most 100 characters.');
    if (typeof mutate !== 'function') throw new TypeError('Verification challenge mutation callback is required.');

    await ensureVerificationChallengeCatalogTables();
    const updatedChallenge = await withVerificationCatalogTransaction(async (query) => {
        const rows = await query(`
            SELECT * FROM verification_challenge_catalog
            WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL
            FOR UPDATE
        `, [normalizedGuildId, normalizedChallengeId]);
        const row = rows?.[0];
        if (!row) throw new Error(`Unknown verification challenge: ${normalizedChallengeId}`);

        const currentChallenge = catalogRowsToChallenge(row, []);
        const nextChallenge = mutate(cloneCatalogValue(currentChallenge));
        if (!nextChallenge || String(nextChallenge.id) !== normalizedChallengeId) {
            throw new Error('Verification challenge mutations cannot change the challenge ID.');
        }
        if (!settingsValuesEqual(currentChallenge, nextChallenge)) {
            await updateLockedChallengeRow(query, normalizedGuildId, normalizedChallengeId, nextChallenge, updatedBy);
        }
        return nextChallenge;
    });

    clearVerificationChallengeCatalogCache(normalizedGuildId);
    return updatedChallenge;
}

async function mutateVerificationQuestionCatalogEntries({ guildId, challengeId, questionIds, updatedBy, mutate }) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedChallengeId = String(challengeId ?? '').trim();
    const normalizedQuestionIds = [...new Set((questionIds ?? [])
        .map((questionId) => String(questionId ?? '').trim())
        .filter(Boolean))];
    if (!normalizedChallengeId) throw new Error('Verification challenge ID is required.');
    if (normalizedQuestionIds.length < 1) throw new Error('At least one verification question ID is required.');
    if (typeof mutate !== 'function') throw new TypeError('Verification question mutation callback is required.');

    await ensureVerificationChallengeCatalogTables();
    const updatedQuestions = await withVerificationCatalogTransaction(async (query) => {
        const placeholders = normalizedQuestionIds.map(() => '?').join(', ');
        const rows = await query(`
            SELECT * FROM verification_question_catalog
            WHERE guild_id = ? AND challenge_id = ? AND question_id IN (${placeholders})
                AND deleted_at IS NULL
            FOR UPDATE
        `, [normalizedGuildId, normalizedChallengeId, ...normalizedQuestionIds]);
        const currentQuestions = new Map((rows ?? []).map((row) => [String(row.question_id), catalogRowToQuestion(row)]));
        const missingQuestionId = normalizedQuestionIds.find((questionId) => !currentQuestions.has(questionId));
        if (missingQuestionId) {
            throw new Error(`Unknown verification question: ${normalizedChallengeId}/${missingQuestionId}`);
        }

        const workingQuestions = new Map([...currentQuestions.entries()]
            .map(([questionId, question]) => [questionId, cloneCatalogValue(question)]));
        const nextQuestions = mutate(workingQuestions);
        if (!(nextQuestions instanceof Map)) {
            throw new TypeError('Verification question mutation callback must return a Map.');
        }
        for (const questionId of normalizedQuestionIds) {
            const nextQuestion = nextQuestions.get(questionId);
            if (!nextQuestion || String(nextQuestion.id) !== questionId) {
                throw new Error('Verification question mutations cannot remove or rename targeted questions.');
            }
            if (!settingsValuesEqual(currentQuestions.get(questionId), nextQuestion)) {
                await updateLockedQuestionRow(
                    query,
                    normalizedGuildId,
                    normalizedChallengeId,
                    questionId,
                    nextQuestion,
                    updatedBy,
                );
            }
        }
        return nextQuestions;
    });

    clearVerificationChallengeCatalogCache(normalizedGuildId);
    return updatedQuestions;
}

async function createVerificationChallengeCatalogEntry({ guildId, challengeId, title, description, color, createdBy }) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedChallengeId = String(challengeId ?? '').trim();
    if (!normalizedChallengeId) throw new Error('Verification challenge ID is required.');
    if (normalizedChallengeId.length > 100) throw new Error('Verification challenge ID must be at most 100 characters.');
    await ensureVerificationChallengeCatalogTables();
    const challenge = await withVerificationCatalogTransaction(async (query) => {
        await query(`SELECT guild_id FROM verification_guild_settings WHERE guild_id = ? FOR UPDATE`, [normalizedGuildId]);
        // Lock the guild's primary-key range so concurrent creates serialize before
        // enforcing Discord's 25-option challenge selector limit.
        const guildRows = await query(`
            SELECT challenge_id FROM verification_challenge_catalog
            WHERE guild_id = ? FOR UPDATE
        `, [normalizedGuildId]);
        const activeRows = await query(`
            SELECT challenge_id FROM verification_challenge_catalog
            WHERE guild_id = ? AND deleted_at IS NULL FOR UPDATE
        `, [normalizedGuildId]);
        if ((activeRows?.length ?? 0) >= MAX_ACTIVE_CATALOG_CHALLENGES) {
            const error = new Error(`A server can have at most ${MAX_ACTIVE_CATALOG_CHALLENGES} verification challenges.`);
            error.code = 'VERIFICATION_CHALLENGE_LIMIT';
            throw error;
        }
        const rows = await query(`
            SELECT challenge_id FROM verification_challenge_catalog
            WHERE guild_id = ? AND challenge_id = ? FOR UPDATE
        `, [normalizedGuildId, normalizedChallengeId]);
        if (rows?.length || guildRows.some((row) => String(row.challenge_id) === normalizedChallengeId)) {
            throw new Error(`Verification challenge ID already exists: ${normalizedChallengeId}`);
        }
        await query(`
            INSERT INTO verification_challenge_catalog
                (guild_id, challenge_id, source_type, template_version, protected_template,
                 title, description, color, enabled, created_by, updated_by)
            VALUES (?, ?, 'admin', ?, 0, ?, ?, ?, 0, ?, ?)
        `, [normalizedGuildId, normalizedChallengeId, TEMPLATE_VERSION, title ?? null,
            description ?? null, color ?? null, String(createdBy ?? 'admin'), String(createdBy ?? 'admin')]);
        return { id: normalizedChallengeId, sourceType: 'admin', protectedTemplate: false,
            enabled: false, title, description, color, questions: [] };
    });
    clearVerificationChallengeCatalogCache(normalizedGuildId);
    return challenge;
}

async function createVerificationQuestionCatalogEntry({ guildId, challengeId, question, createdBy }) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedChallengeId = String(challengeId ?? '').trim();
    const normalizedQuestionId = String(question?.id ?? '').trim();
    if (!normalizedChallengeId || !normalizedQuestionId) throw new Error('Challenge and question IDs are required.');
    if (normalizedChallengeId.length > 100 || normalizedQuestionId.length > 100) {
        throw new Error('Challenge and question IDs must be at most 100 characters.');
    }
    await ensureVerificationChallengeCatalogTables();
    const created = await withVerificationCatalogTransaction(async (query) => {
        const parentRows = await query(`SELECT challenge_id FROM verification_challenge_catalog
            WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL FOR UPDATE`,
        [normalizedGuildId, normalizedChallengeId]);
        if (!parentRows?.length) throw new Error(`Unknown verification challenge: ${normalizedChallengeId}`);
        const siblingRows = await query(`SELECT question_id, question_order FROM verification_question_catalog
            WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL ORDER BY question_order FOR UPDATE`,
        [normalizedGuildId, normalizedChallengeId]);
        if (siblingRows.some((row) => String(row.question_id) === normalizedQuestionId)) {
            throw new Error(`Verification question ID already exists: ${normalizedChallengeId}/${normalizedQuestionId}`);
        }
        const collisionRows = await query(`SELECT question_id FROM verification_question_catalog
            WHERE guild_id = ? AND challenge_id = ? AND question_id = ? FOR UPDATE`,
        [normalizedGuildId, normalizedChallengeId, normalizedQuestionId]);
        if (collisionRows?.length) throw new Error(`Verification question ID already exists: ${normalizedChallengeId}/${normalizedQuestionId}`);
        await resequenceLockedQuestionRows(query, normalizedGuildId, normalizedChallengeId, siblingRows, createdBy);
        const createdQuestion = { ...question, id: normalizedQuestionId, order: siblingRows.length + 1 };
        await query(`INSERT INTO verification_question_catalog
            (guild_id, challenge_id, question_id, question_order, source_type, template_version,
             protected_template, question_label, question_text, separate_step, task_enabled, task_type,
             task_prompt_text, task_image_pool_id, task_image_ids_json, task_image_directions_json,
             task_config_json, answer_required, answer_type, answer_input_label, answer_input_placeholder,
             answers_json, created_by, updated_by)
            VALUES (?, ?, ?, ?, 'admin', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            normalizedGuildId, normalizedChallengeId, normalizedQuestionId, createdQuestion.order, TEMPLATE_VERSION,
            ...questionToCatalogContentValues(createdQuestion).slice(1), String(createdBy ?? 'admin'), String(createdBy ?? 'admin'),
        ]);
        return { ...createdQuestion, sourceType: 'admin', protectedTemplate: false };
    });
    clearVerificationChallengeCatalogCache(normalizedGuildId);
    return created;
}

async function deleteOrResetVerificationChallengeCatalogEntry({ guildId, challengeId, updatedBy }) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedChallengeId = String(challengeId ?? '').trim();
    await ensureVerificationChallengeCatalogTables();
    const result = await withVerificationCatalogTransaction(async (query) => {
        const rows = await query(`SELECT * FROM verification_challenge_catalog
            WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL FOR UPDATE`,
        [normalizedGuildId, normalizedChallengeId]);
        const row = rows?.[0];
        if (!row) throw new Error(`Unknown verification challenge: ${normalizedChallengeId}`);
        const isProtectedTemplate = row.source_type === 'template' && Boolean(Number(row.protected_template));
        const isCustom = row.source_type === 'admin' && !Boolean(Number(row.protected_template));
        if (!isProtectedTemplate && !isCustom) throw new Error('Verification challenge catalog ownership metadata is inconsistent.');
        const questionRows = await query(`SELECT question_id, question_order, source_type, protected_template, deleted_at
            FROM verification_question_catalog
            WHERE guild_id = ? AND challenge_id = ? FOR UPDATE`,
        [normalizedGuildId, normalizedChallengeId]);
        for (const questionRow of questionRows) {
            const protectedQuestion = questionRow.source_type === 'template' && Boolean(Number(questionRow.protected_template));
            const customQuestion = questionRow.source_type === 'admin' && !Boolean(Number(questionRow.protected_template));
            if (!protectedQuestion && !customQuestion) {
                throw new Error(`Verification question catalog ownership metadata is inconsistent: ${normalizedChallengeId}/${questionRow.question_id}`);
            }
        }
        if (isCustom) {
            const settingsRows = await query(`SELECT active_challenge_ids_json FROM verification_guild_settings
                WHERE guild_id = ? LIMIT 1 FOR UPDATE`, [normalizedGuildId]);
            const parsedActiveIds = safeParseJson(settingsRows?.[0]?.active_challenge_ids_json, []);
            const activeIds = (Array.isArray(parsedActiveIds) ? parsedActiveIds : []).map(String);
            if (activeIds.includes(normalizedChallengeId)) {
                const error = new Error('Deactivate this verification challenge in Settings before deleting it.');
                error.code = 'VERIFICATION_CHALLENGE_ACTIVE';
                throw error;
            }
            await query(`UPDATE verification_question_catalog SET deleted_at = CURRENT_TIMESTAMP, updated_by = ?
                WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL`,
            [String(updatedBy ?? 'admin'), normalizedGuildId, normalizedChallengeId]);
            await query(`UPDATE verification_challenge_catalog SET deleted_at = CURRENT_TIMESTAMP, enabled = 0, updated_by = ?
                WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL`,
            [String(updatedBy ?? 'admin'), normalizedGuildId, normalizedChallengeId]);
            return { action: 'deleted', challengeId: normalizedChallengeId };
        }
        const template = getVerificationChallengeTemplate(normalizedChallengeId);
        if (!template) throw new Error(`Missing protected verification challenge template: ${normalizedChallengeId}`);
        await updateLockedChallengeRow(query, normalizedGuildId, normalizedChallengeId, template, updatedBy);
        const currentTemplateIds = new Set((template.questions ?? []).map((question) => String(question.id)));
        const templateCatalogRows = templateChallengeToCatalogRows(template, normalizedGuildId).questionRows;
        const obsoleteProtectedRows = questionRows.filter((questionRow) =>
            questionRow.source_type === 'template' && Boolean(Number(questionRow.protected_template))
            && !currentTemplateIds.has(String(questionRow.question_id)) && !questionRow.deleted_at);
        for (const obsoleteRow of obsoleteProtectedRows) {
            await query(`UPDATE verification_question_catalog
                SET deleted_at = CURRENT_TIMESTAMP, updated_by = ?
                WHERE guild_id = ? AND challenge_id = ? AND question_id = ?
                    AND source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL`,
            [String(updatedBy ?? 'admin'), normalizedGuildId, normalizedChallengeId, obsoleteRow.question_id]);
        }
        for (const question of template.questions ?? []) {
            const existing = questionRows.find((row) => String(row.question_id) === String(question.id));
            if (existing && (existing.source_type !== 'template' || !Boolean(Number(existing.protected_template)))) {
                throw new Error(`Protected template question ID is owned by a custom row: ${normalizedChallengeId}/${question.id}`);
            }
            if (existing) {
                await resetProtectedQuestionRow(query, normalizedGuildId, normalizedChallengeId, question, updatedBy);
            }
            else {
                const templateRow = templateCatalogRows.find((candidate) => candidate.question_id === question.id);
                await upsertProtectedTemplateQuestionRow(templateRow, updatedBy, query);
            }
        }
        const activeCustomRows = questionRows.filter((questionRow) =>
            questionRow.source_type === 'admin' && !Boolean(Number(questionRow.protected_template)) && !questionRow.deleted_at);
        const deterministicRows = orderTemplateThenCustom([
            ...(template.questions ?? []).map((question) => ({ question_id: question.id, question_order: question.order })),
            ...activeCustomRows,
        ], template);
        await resequenceLockedQuestionRows(query, normalizedGuildId, normalizedChallengeId, deterministicRows, updatedBy);
        return { action: 'reset', challengeId: normalizedChallengeId };
    });
    clearVerificationChallengeCatalogCache(normalizedGuildId);
    return result;
}

async function deleteOrResetVerificationQuestionCatalogEntry({ guildId, challengeId, questionId, updatedBy }) {
    const normalizedGuildId = normalizeGuildId(guildId);
    const normalizedChallengeId = String(challengeId ?? '').trim();
    const normalizedQuestionId = String(questionId ?? '').trim();
    await ensureVerificationChallengeCatalogTables();
    const result = await withVerificationCatalogTransaction(async (query) => {
        const parent = await query(`SELECT challenge_id FROM verification_challenge_catalog
            WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL FOR UPDATE`, [normalizedGuildId, normalizedChallengeId]);
        if (!parent?.length) throw new Error(`Unknown verification challenge: ${normalizedChallengeId}`);
        const siblings = await query(`SELECT * FROM verification_question_catalog
            WHERE guild_id = ? AND challenge_id = ? AND deleted_at IS NULL ORDER BY question_order, question_id FOR UPDATE`,
        [normalizedGuildId, normalizedChallengeId]);
        const row = siblings.find((candidate) => String(candidate.question_id) === normalizedQuestionId);
        if (!row) throw new Error(`Unknown verification question: ${normalizedChallengeId}/${normalizedQuestionId}`);
        const isProtectedTemplate = row.source_type === 'template' && Boolean(Number(row.protected_template));
        const isCustom = row.source_type === 'admin' && !Boolean(Number(row.protected_template));
        if (!isProtectedTemplate && !isCustom) throw new Error('Verification question catalog ownership metadata is inconsistent.');
        if (isProtectedTemplate) {
            const templateQuestion = getVerificationChallengeTemplate(normalizedChallengeId)?.questions
                ?.find((question) => question.id === normalizedQuestionId);
            if (!templateQuestion) throw new Error(`Missing protected verification question template: ${normalizedChallengeId}/${normalizedQuestionId}`);
            await updateLockedQuestionRow(query, normalizedGuildId, normalizedChallengeId, normalizedQuestionId, templateQuestion, updatedBy);
            const reordered = orderTemplateThenCustom(siblings, getVerificationChallengeTemplate(normalizedChallengeId));
            await resequenceLockedQuestionRows(query, normalizedGuildId, normalizedChallengeId, reordered, updatedBy);
            return { action: 'reset', challengeId: normalizedChallengeId, questionId: normalizedQuestionId };
        }
        await query(`UPDATE verification_question_catalog SET deleted_at = CURRENT_TIMESTAMP, updated_by = ?
            WHERE guild_id = ? AND challenge_id = ? AND question_id = ? AND deleted_at IS NULL`,
        [String(updatedBy ?? 'admin'), normalizedGuildId, normalizedChallengeId, normalizedQuestionId]);
        const remaining = siblings.filter((candidate) => String(candidate.question_id) !== normalizedQuestionId);
        await resequenceLockedQuestionRows(query, normalizedGuildId, normalizedChallengeId, remaining, updatedBy);
        return { action: 'deleted', challengeId: normalizedChallengeId, questionId: normalizedQuestionId };
    });
    clearVerificationChallengeCatalogCache(normalizedGuildId);
    return result;
}

function getVerificationChallengeTemplate(challengeId) {
    const normalizedChallengeId = String(challengeId ?? '').trim();
    const template = verificationChallenges[normalizedChallengeId];
    if (!template) return undefined;

    const normalized = normalizeVerificationChallenge(template, { challengeOverrides: {} });
    return {
        ...normalized,
        questions: (normalized.questions ?? []).map((question, index) => ({
            ...question,
            order: index + 1,
        })),
    };
}

function normalizeComparableValue(value) {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
        if (value.length < 1) return undefined;
        return value.map(normalizeComparableValue);
    }
    if (typeof value === 'object') {
        const normalizedEntries = Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, normalizeComparableValue(entry)])
            .filter(([, entry]) => entry !== undefined);
        return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
    }
    return value;
}

function settingsValuesEqual(left, right) {
    return JSON.stringify(normalizeComparableValue(left)) === JSON.stringify(normalizeComparableValue(right));
}

function buildSettingsValueDiff(actual = {}, baseline = {}, depth = 0) {
    return Object.entries(actual).reduce((diff, [key, actualValue]) => {
        const baselineValue = baseline?.[key];
        if (settingsValuesEqual(actualValue, baselineValue)) return diff;

        if (
            depth === 0 && actualValue && baselineValue
            && typeof actualValue === 'object' && !Array.isArray(actualValue)
            && typeof baselineValue === 'object' && !Array.isArray(baselineValue)
        ) {
            // Runtime shallowly replaces generatedImage/answer members. Recurse
            // through those containers, but retain each changed child object whole.
            const nestedDiff = buildSettingsValueDiff(actualValue, baselineValue, depth + 1);
            if (Object.keys(nestedDiff).length > 0) diff[key] = nestedDiff;
            return diff;
        }

        diff[key] = actualValue;
        return diff;
    }, {});
}

function catalogQuestionToSettingsValues(question = {}) {
    const generatedImageInput = question.generatedImage ?? {};
    const additionalTaskConfig = Object.fromEntries(
        Object.entries(generatedImageInput)
            .filter(([key, value]) => !SETTINGS_TASK_KEYS.has(key) && value !== undefined && value !== null),
    );
    const taskConfig = {
        ...(generatedImageInput.config ?? {}),
        ...additionalTaskConfig,
    };
    const generatedImage = pruneNullishObject({
        enabled: generatedImageInput.enabled,
        type: generatedImageInput.type,
        text: generatedImageInput.text,
        imagePoolId: generatedImageInput.imagePoolId,
        gallerySize: generatedImageInput.gallerySize,
        compositeImageGallery: generatedImageInput.compositeImageGallery,
        solutionImageCount: generatedImageInput.solutionImageCount,
        controlImageCount: generatedImageInput.controlImageCount,
        maxControlImageRepeats: generatedImageInput.maxControlImageRepeats,
        imageIds: generatedImageInput.imageIds,
        imageDirections: generatedImageInput.imageDirections,
        ...(Object.keys(taskConfig).length > 0 ? { config: taskConfig } : {}),
    });
    if (Object.prototype.hasOwnProperty.call(generatedImageInput, 'imagePoolId') && generatedImageInput.imagePoolId === null) {
        generatedImage.imagePoolId = null;
    }
    const answer = pruneNullishObject({
        required: question.answer?.required,
        type: question.answer?.type,
        inputLabel: question.answer?.inputLabel,
        inputPlaceholder: question.answer?.inputPlaceholder,
        accepted: question.answer?.accepted,
    });

    return pruneNullishObject({
        order: question.order,
        label: question.label,
        text: question.text,
        separateStep: question.separateStep,
        ...(Object.keys(generatedImage).length > 0 ? { generatedImage } : {}),
        ...(Object.keys(answer).length > 0 ? { answer } : {}),
    });
}

function catalogQuestionToSettingsOverride(question = {}, templateQuestion) {
    const settingsValues = catalogQuestionToSettingsValues(question);
    const configOverride = templateQuestion
        ? buildSettingsValueDiff(settingsValues, catalogQuestionToSettingsValues(templateQuestion))
        : settingsValues;

    return pruneNullishObject({
        ...configOverride,
        updatedBy: question.updatedBy,
        updatedAt: question.updatedAt,
    });
}

function catalogChallengeToSettingsOverride(challenge = {}) {
    const staticChallenge = verificationChallenges[challenge.id];
    const templateChallenge = staticChallenge
        ? normalizeVerificationChallenge(staticChallenge, { challengeOverrides: {} })
        : undefined;
    const templateQuestions = new Map((templateChallenge?.questions ?? []).map((question, index) => [
        question.id,
        { ...question, order: index + 1 },
    ]));
    const challengeOverride = {};

    for (const key of ['title', 'description', 'color']) {
        if (!templateChallenge || !settingsValuesEqual(challenge[key], templateChallenge[key])) {
            challengeOverride[key] = challenge[key];
        }
    }

    challengeOverride.questions = Object.fromEntries((challenge.questions ?? []).map((question) => [
        question.id,
        catalogQuestionToSettingsOverride(question, templateQuestions.get(question.id)),
    ]));

    return pruneNullishObject(challengeOverride);
}

function catalogChallengesToSettingsOverrides(catalog = {}) {
    return Object.fromEntries(Object.values(catalog).map((challenge) => [
        challenge.id,
        catalogChallengeToSettingsOverride(challenge),
    ]));
}

async function getVerificationChallengeCatalog(guildId = DEFAULT_GUILD_ID) {
    const normalizedGuildId = normalizeGuildId(guildId);
    if (catalogCache.has(normalizedGuildId)) return catalogCache.get(normalizedGuildId);

    await ensureVerificationChallengeTemplatesSeeded(normalizedGuildId);

    const challengeRows = await getDatabase().query('SELECT * FROM verification_challenge_catalog WHERE guild_id = ? AND deleted_at IS NULL ORDER BY challenge_id', [normalizedGuildId]);
    const questionRows = await getDatabase().query('SELECT * FROM verification_question_catalog WHERE guild_id = ? AND deleted_at IS NULL ORDER BY challenge_id, question_order, question_id', [normalizedGuildId]);
    const questionsByChallenge = questionRows.reduce((byChallenge, row) => {
        if (!byChallenge.has(row.challenge_id)) byChallenge.set(row.challenge_id, []);
        byChallenge.get(row.challenge_id).push(row);
        return byChallenge;
    }, new Map());
    const catalog = challengeRows.reduce((result, row) => {
        result[row.challenge_id] = catalogRowsToChallenge(row, questionsByChallenge.get(row.challenge_id) ?? []);
        return result;
    }, {});

    catalogCache.set(normalizedGuildId, catalog);
    return catalog;
}

async function getVerificationChallengeFromCatalog(guildId, challengeId) {
    const catalog = await getVerificationChallengeCatalog(guildId);
    return catalog[String(challengeId)];
}

async function getVerificationChallengeOverridesFromCatalog(guildId = DEFAULT_GUILD_ID) {
    return catalogChallengesToSettingsOverrides(await getVerificationChallengeCatalog(guildId));
}

function clearVerificationChallengeCatalogCache(guildId) {
    if (guildId === undefined || guildId === null) {
        catalogCache.clear();
        return;
    }

    catalogCache.delete(normalizeGuildId(guildId));
}

// Future Admin UX delete/reset rule:
// Protected template challenges are not permanently deleteable. For rows with
// source_type = 'template' and protected_template = 1, delete should reset the DB
// row to template defaults instead of removing it. Admin/custom rows with
// source_type = 'admin' and protected_template = 0 may be deleted or soft-deleted.
module.exports = {
    ensureVerificationChallengeCatalogTables,
    ensureVerificationChallengeTemplatesSeeded,
    syncVerificationChallengeCatalogFromSettings,
    writeVerificationChallengeCatalogEntriesFromSettings,
    upsertProtectedTemplateChallengeRow,
    upsertProtectedTemplateQuestionRow,
    getVerificationChallengeCatalog,
    getVerificationChallengeFromCatalog,
    getVerificationChallengeOverridesFromCatalog,
    templateChallengeToCatalogRows,
    catalogRowsToChallenge,
    catalogRowToQuestion,
    getVerificationChallengeTemplate,
    mutateVerificationChallengeCatalogEntry,
    mutateVerificationQuestionCatalogEntries,
    createVerificationChallengeCatalogEntry,
    createVerificationQuestionCatalogEntry,
    deleteOrResetVerificationChallengeCatalogEntry,
    deleteOrResetVerificationQuestionCatalogEntry,
    catalogQuestionToSettingsOverride,
    catalogChallengesToSettingsOverrides,
    clearVerificationChallengeCatalogCache,
};
