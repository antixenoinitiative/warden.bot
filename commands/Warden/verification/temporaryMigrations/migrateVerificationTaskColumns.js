const { ensureVerificationSettingsTables } = require('../verificationSettings');

const MIGRATION_ID = 'verification_task_columns_20260715';
const TABLE = 'verification_challenge_config';
const BACKUP_TABLE = 'verification_challenge_config_backup_task_columns_20260715';
let migrationPromise;

function getDatabase() {
    return require('../../../../Warden/db/database');
}

async function tableExists(tableName) {
    const rows = await getDatabase().query('SHOW TABLES LIKE ?', [tableName]);
    return rows.length > 0;
}

async function columnExists(tableName, columnName) {
    const rows = await getDatabase().query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
    return rows.length > 0;
}

async function addColumnIfMissing(tableName, columnName, ddl) {
    if (await columnExists(tableName, columnName)) return false;
    await getDatabase().query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
    return true;
}

async function ensureMigrationTable() {
    await getDatabase().query(`
        CREATE TABLE IF NOT EXISTS verification_migrations (
            migration_id VARCHAR(128) NOT NULL PRIMARY KEY,
            ran_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            details_json TEXT NULL
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
}

async function migrationAlreadyRan() {
    const rows = await getDatabase().query(
        'SELECT migration_id FROM verification_migrations WHERE migration_id = ? LIMIT 1',
        [MIGRATION_ID],
    );
    return rows.length > 0;
}

async function createBackupIfMissing() {
    if (await tableExists(BACKUP_TABLE)) return false;
    await getDatabase().query(`CREATE TABLE \`${BACKUP_TABLE}\` AS SELECT * FROM \`${TABLE}\``);
    return true;
}

async function addTaskColumns() {
    const added = [];
    if (await addColumnIfMissing(TABLE, 'task_enabled', 'task_enabled TINYINT(1) NULL AFTER separate_step')) added.push('task_enabled');
    if (await addColumnIfMissing(TABLE, 'task_type', 'task_type VARCHAR(64) NULL AFTER task_enabled')) added.push('task_type');
    if (await addColumnIfMissing(TABLE, 'task_prompt_text', 'task_prompt_text TEXT NULL AFTER task_type')) added.push('task_prompt_text');
    if (await addColumnIfMissing(TABLE, 'task_image_ids_json', 'task_image_ids_json TEXT NULL AFTER answers_json')) added.push('task_image_ids_json');
    if (await addColumnIfMissing(TABLE, 'task_image_directions_json', 'task_image_directions_json TEXT NULL AFTER task_image_ids_json')) added.push('task_image_directions_json');
    if (await addColumnIfMissing(TABLE, 'task_config_json', 'task_config_json TEXT NULL AFTER task_image_directions_json')) added.push('task_config_json');
    return added;
}

async function backfillTaskColumns() {
    const result = await getDatabase().query(`
        UPDATE \`${TABLE}\`
        SET
            task_enabled = COALESCE(task_enabled, generate_image),
            task_type = COALESCE(task_type, generated_image_type),
            task_prompt_text = COALESCE(task_prompt_text, generated_image_text),
            task_image_ids_json = COALESCE(task_image_ids_json, image_ids_json),
            task_image_directions_json = COALESCE(task_image_directions_json, image_directions_json),
            task_config_json = COALESCE(task_config_json, image_config_json)
        WHERE question_id <> '__challenge__'
    `);
    return result?.affectedRows ?? 0;
}

async function normalizeKnownTaskTypes() {
    await getDatabase().query(`
        UPDATE \`${TABLE}\`
        SET task_type = 'none'
        WHERE question_id <> '__challenge__'
          AND task_type IN ('', 'false', 'disabled', 'off')
    `);

    await getDatabase().query(`
        UPDATE \`${TABLE}\`
        SET task_type = 'prompt-text'
        WHERE question_id <> '__challenge__'
          AND task_type IN ('prompt', 'text-image', 'generated-text', 'generated-prompt-text')
    `);

    await getDatabase().query(`
        UPDATE \`${TABLE}\`
        SET task_type = 'gallery-standard'
        WHERE question_id <> '__challenge__'
          AND task_type IN ('gallery', 'standard-gallery', 'image-gallery')
    `);

    await getDatabase().query(`
        UPDATE \`${TABLE}\`
        SET task_type = 'gallery-rotation-alignment'
        WHERE question_id <> '__challenge__'
          AND task_type IN ('rotation', 'rotation-gallery', 'rotation-alignment')
    `);
}

async function getUnknownTaskTypes() {
    return getDatabase().query(`
        SELECT guild_id, challenge_id, question_id, task_type
        FROM \`${TABLE}\`
        WHERE question_id <> '__challenge__'
          AND task_type IS NOT NULL
          AND task_type NOT IN ('none', 'prompt-text', 'static-image', 'gallery-standard', 'gallery-rotation-alignment')
    `);
}

async function markMigrationComplete(details) {
    await getDatabase().query(
        `INSERT INTO verification_migrations (migration_id, details_json)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE details_json = VALUES(details_json)`,
        [MIGRATION_ID, JSON.stringify(details ?? {})],
    );
}

async function runVerificationTaskColumnMigration({ guildId, updatedBy } = {}) {
    if (migrationPromise) return migrationPromise;

    migrationPromise = (async () => {
        await ensureVerificationSettingsTables();
        await ensureMigrationTable();

        if (await migrationAlreadyRan()) {
            console.log(`[STARTUP] Verification task-column migration already completed: ${MIGRATION_ID}`);
            return { skipped: true };
        }

        console.log(`[STARTUP] Running verification task-column migration: ${MIGRATION_ID}`);

        const backupCreated = await createBackupIfMissing();
        const addedColumns = await addTaskColumns();
        const backfilledRows = await backfillTaskColumns();
        await normalizeKnownTaskTypes();
        const unknownTaskTypes = await getUnknownTaskTypes();

        if (unknownTaskTypes.length > 0) {
            console.warn('[STARTUP] Verification task-column migration found unknown task types:', unknownTaskTypes);
        }

        const details = {
            guildId: guildId ?? null,
            updatedBy: updatedBy ?? null,
            backupCreated,
            addedColumns,
            backfilledRows,
            unknownTaskTypeCount: unknownTaskTypes.length,
        };

        await markMigrationComplete(details);
        console.log(`[STARTUP] Verification task-column migration completed: ${MIGRATION_ID}`, details);
        return details;
    })();

    try {
        return await migrationPromise;
    }
    catch (err) {
        migrationPromise = undefined;
        throw err;
    }
}

module.exports = {
    runVerificationTaskColumnMigration,
};
