const { verificationChallenges } = require('./verificationChallenges/verificationChallengesConfig');
const { normalizeVerificationChallenge } = require('./verificationChallenges/verificationChallenges');
let database;

const DEFAULT_GUILD_ID = 'global';
const TEMPLATE_VERSION = 1;
const DEDICATED_TASK_KEYS = new Set(['enabled', 'type', 'text', 'imagePoolId', 'imageIds', 'imageDirections']);
const catalogCache = new Map();
let catalogTablesReady;

function getDatabase() {
    if (!database) {
        database = require('../../../Warden/db/database');
    }

    return database;
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

function pruneNullishObject(value) {
    return Object.fromEntries(
        Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined && entry !== null),
    );
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

async function insertChallengeRowIfMissing(row) {
    await getDatabase().query(`
        INSERT IGNORE INTO verification_challenge_catalog (
            guild_id, challenge_id, source_type, source_template_id, template_version, protected_template,
            title, description, color, fields_json, enabled, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'seed')
    `, [row.guild_id, row.challenge_id, row.source_type, row.source_template_id, row.template_version, row.protected_template, row.title, row.description, row.color, row.fields_json, row.enabled]);
}

async function insertQuestionRowIfMissing(row) {
    await getDatabase().query(`
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
async function ensureVerificationChallengeTemplatesSeeded(guildId = DEFAULT_GUILD_ID) {
    const normalizedGuildId = normalizeGuildId(guildId);
    await ensureVerificationChallengeCatalogTables();

    // TODO: Wrap template seeding in a transaction once catalog writes expand beyond
    // insert-if-missing foundation work.
    for (const challenge of Object.values(verificationChallenges)) {
        const { challengeRow, questionRows } = templateChallengeToCatalogRows(challenge, normalizedGuildId);
        await insertChallengeRowIfMissing(challengeRow);
        for (const questionRow of questionRows) {
            await insertQuestionRowIfMissing(questionRow);
        }
    }

    clearVerificationChallengeCatalogCache(normalizedGuildId);
}

async function upsertProtectedTemplateChallengeRow(row, updatedBy = 'sync') {
    const normalizedUpdatedBy = String(updatedBy ?? 'sync');
    await getDatabase().query(`
        INSERT INTO verification_challenge_catalog (
            guild_id, challenge_id, source_type, source_template_id, template_version,
            protected_template, title, description, color, fields_json, enabled,
            created_by, updated_by
        ) VALUES (?, ?, 'template', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            title = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(title), title),
            description = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(description), description),
            color = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(color), color),
            fields_json = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(fields_json), fields_json),
            enabled = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(enabled), enabled),
            source_template_id = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(source_template_id), source_template_id),
            template_version = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(template_version), template_version),
            updated_by = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(updated_by), updated_by)
    `, [row.guild_id, row.challenge_id, row.source_template_id, row.template_version, row.title, row.description, row.color, row.fields_json, row.enabled, normalizedUpdatedBy, normalizedUpdatedBy]);
}

async function upsertProtectedTemplateQuestionRow(row, updatedBy = 'sync') {
    const normalizedUpdatedBy = String(updatedBy ?? 'sync');
    await getDatabase().query(`
        INSERT INTO verification_question_catalog (
            guild_id, challenge_id, question_id, question_order, source_type, source_template_id,
            template_version, protected_template, question_label, question_text, separate_step,
            task_enabled, task_type, task_prompt_text, task_image_pool_id, task_image_ids_json,
            task_image_directions_json, task_config_json, answer_required, answer_type,
            answer_input_label, answer_input_placeholder, answers_json, created_by, updated_by
        ) VALUES (?, ?, ?, ?, 'template', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
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
            template_version = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(template_version), template_version),
            updated_by = IF(source_type = 'template' AND protected_template = 1 AND deleted_at IS NULL, VALUES(updated_by), updated_by)
    `, [row.guild_id, row.challenge_id, row.question_id, row.question_order, row.source_template_id, row.template_version, row.question_label, row.question_text, row.separate_step, row.task_enabled, row.task_type, row.task_prompt_text, row.task_image_pool_id, row.task_image_ids_json, row.task_image_directions_json, row.task_config_json, row.answer_required, row.answer_type, row.answer_input_label, row.answer_input_placeholder, row.answers_json, normalizedUpdatedBy, normalizedUpdatedBy]);
}

// Transition helper: mirror current effective legacy verification config into
// protected template catalog rows while runtime/Admin UX continue using the
// legacy settings path. Future catalog-authoritative migration should remove
// the legacy override dependency from this sync path.
async function syncVerificationChallengeCatalogFromSettings(guildId, verificationSettings, updatedBy = 'sync') {
    const normalizedGuildId = normalizeGuildId(guildId);
    await ensureVerificationChallengeCatalogTables();
    await ensureVerificationChallengeTemplatesSeeded(normalizedGuildId);

    for (const staticChallenge of Object.values(verificationChallenges)) {
        const effectiveChallenge = normalizeVerificationChallenge(staticChallenge, verificationSettings);
        const { challengeRow, questionRows } = templateChallengeToCatalogRows(effectiveChallenge, normalizedGuildId);
        await upsertProtectedTemplateChallengeRow(challengeRow, updatedBy);
        for (const questionRow of questionRows) {
            await upsertProtectedTemplateQuestionRow(questionRow, updatedBy);
        }
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
        enabled: Boolean(Number(challengeRow.enabled)),
        title: challengeRow.title ?? undefined,
        description: challengeRow.description ?? undefined,
        color: challengeRow.color ?? undefined,
        fields: safeParseJson(challengeRow.fields_json, undefined),
        questions: rowsWithIndex.map(({ row }) => {
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
            const answer = pruneNullishObject({
                required: nullableBoolean(row.answer_required),
                type: row.answer_type ?? undefined,
                inputLabel: row.answer_input_label ?? undefined,
                inputPlaceholder: row.answer_input_placeholder ?? undefined,
                accepted: safeParseJson(row.answers_json, undefined),
            });

            return {
                id: row.question_id,
                order: row.question_order ?? undefined,
                label: row.question_label ?? undefined,
                text: row.question_text ?? undefined,
                separateStep: nullableBoolean(row.separate_step),
                ...(Object.keys(generatedImage).length > 0 ? { generatedImage } : {}),
                ...(Object.keys(answer).length > 0 ? { answer } : {}),
            };
        }),
    };
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
    upsertProtectedTemplateChallengeRow,
    upsertProtectedTemplateQuestionRow,
    getVerificationChallengeCatalog,
    getVerificationChallengeFromCatalog,
    templateChallengeToCatalogRows,
    catalogRowsToChallenge,
    clearVerificationChallengeCatalogCache,
};
