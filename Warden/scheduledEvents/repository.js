'use strict';

const database = require('../db/database');
const {
    assertApplicationEncryptionReady,
    createLookup,
    decryptJson,
    encryptJson,
} = require('../db/encryption/applicationEncryption');

const EVENTS_TABLE = 'warden_scheduled_events';
const PUBLICATIONS_TABLE = 'warden_scheduled_event_publications';
const PAYLOAD_CONTEXT = 'warden:scheduled-events:event-payload';
const GUILD_LOOKUP_CONTEXT = 'warden:scheduled-events:guild';
const EVENT_LOOKUP_CONTEXT = 'warden:scheduled-events:event';
const SYNC_STATE_EVENT_LOOKUP = Buffer.alloc(32);

let schemaReady;

function normalizeId(value, label) {
    const id = String(value ?? '').trim();
    if (!/^\d{16,32}$/u.test(id)) throw new Error(`Scheduled events require a valid ${label}.`);
    return id;
}

function guildLookup(guildId) {
    return createLookup(GUILD_LOOKUP_CONTEXT, normalizeId(guildId, 'guild ID'));
}

function eventLookup(eventId) {
    return createLookup(EVENT_LOOKUP_CONTEXT, normalizeId(eventId, 'event ID'));
}

function eventPayload(event) {
    return {
        guildId: normalizeId(event.guildId, 'guild ID'),
        eventId: normalizeId(event.eventId, 'event ID'),
        name: String(event.name ?? 'Untitled Discord Event').slice(0, 100),
        description: event.description ?? null,
        descriptionHtml: event.descriptionHtml ?? null,
        creatorId: event.creatorId ?? null,
        creatorName: event.creatorName ?? null,
        createdAtMs: event.createdAtMs ?? null,
        scheduledStartAtMs: event.scheduledStartAtMs ?? null,
        scheduledEndAtMs: event.scheduledEndAtMs ?? null,
        status: String(event.status ?? 'Scheduled'),
        terminalReason: event.terminalReason ?? null,
        entityType: String(event.entityType ?? 'Unknown'),
        channelId: event.channelId ?? null,
        location: event.location ?? null,
        eventUrl: event.eventUrl ?? null,
        coverImageUrl: event.coverImageUrl ?? null,
        interestedCount: event.interestedCount ?? null,
        sourceDeletedAtMs: event.sourceDeletedAtMs ?? null,
    };
}

function encryptedColumns(event) {
    const encrypted = encryptJson(PAYLOAD_CONTEXT, eventPayload(event));
    return {
        keyVersion: encrypted.keyVersion,
        nonce: encrypted.nonce,
        tag: encrypted.tag,
        payload: encrypted.ciphertext,
    };
}

function decodeRow(row) {
    if (!row) return undefined;
    const payload = decryptJson(PAYLOAD_CONTEXT, {
        keyVersion: row.key_version,
        nonce: row.payload_nonce,
        tag: row.payload_tag,
        ciphertext: row.encrypted_payload,
    });
    return Object.freeze({
        ...eventPayload(payload),
        sourceUpdatedAtMs: Number(row.source_updated_at_ms),
        mirroredAtMs: Number(row.mirrored_at_ms),
        publicationState: row.publication_state ?? null,
        websiteDeletionRequestedAtMs: row.website_deletion_requested_at_ms == null ? null : Number(row.website_deletion_requested_at_ms),
        websiteDeletionCompletedAtMs: row.website_deletion_completed_at_ms == null ? null : Number(row.website_deletion_completed_at_ms),
    });
}

function eventSelect(where = '') {
    return `
        SELECT e.*, p.publication_state, p.website_deletion_requested_at_ms, p.website_deletion_completed_at_ms
        FROM ${EVENTS_TABLE} e
        LEFT JOIN ${PUBLICATIONS_TABLE} p ON p.guild_lookup = e.guild_lookup AND p.event_lookup = e.event_lookup
        ${where}
    `;
}

function lookupKey(value) {
    return Buffer.from(value).toString('hex');
}

function ensureSchema() {
    assertApplicationEncryptionReady();
    if (!schemaReady) {
        schemaReady = (async () => {
            await database.query(`
                CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
                    guild_lookup BINARY(32) NOT NULL,
                    event_lookup BINARY(32) NOT NULL,
                    key_version SMALLINT UNSIGNED NOT NULL,
                    payload_nonce BINARY(12) NOT NULL,
                    payload_tag BINARY(16) NOT NULL,
                    encrypted_payload MEDIUMBLOB NOT NULL,
                    event_status VARCHAR(16) NOT NULL,
                    source_updated_at_ms BIGINT UNSIGNED NOT NULL,
                    mirrored_at_ms BIGINT UNSIGNED NOT NULL,
                    PRIMARY KEY (guild_lookup, event_lookup),
                    KEY scheduled_event_status (guild_lookup, event_status)
                ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            `);
            await database.query(`
                CREATE TABLE IF NOT EXISTS ${PUBLICATIONS_TABLE} (
                    guild_lookup BINARY(32) NOT NULL,
                    event_lookup BINARY(32) NOT NULL,
                    publication_state VARCHAR(24) NOT NULL,
                    publication_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
                    published_at_ms BIGINT UNSIGNED NULL,
                    website_deletion_requested_at_ms BIGINT UNSIGNED NULL,
                    website_deletion_completed_at_ms BIGINT UNSIGNED NULL,
                    last_sync_attempt_at_ms BIGINT UNSIGNED NULL,
                    PRIMARY KEY (guild_lookup, event_lookup),
                    KEY scheduled_event_publication_state (guild_lookup, publication_state)
                ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            `);
        })().catch((error) => {
            schemaReady = undefined;
            throw error;
        });
    }
    return schemaReady;
}

async function upsertEvent(event) {
    await ensureSchema();
    const encrypted = encryptedColumns(event);
    const now = Date.now();
    await database.query(`
        INSERT INTO ${EVENTS_TABLE} (
            guild_lookup, event_lookup, key_version, payload_nonce, payload_tag, encrypted_payload,
            event_status, source_updated_at_ms, mirrored_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            key_version = VALUES(key_version), payload_nonce = VALUES(payload_nonce), payload_tag = VALUES(payload_tag),
            encrypted_payload = VALUES(encrypted_payload), event_status = VALUES(event_status),
            source_updated_at_ms = VALUES(source_updated_at_ms), mirrored_at_ms = VALUES(mirrored_at_ms)
    `, [
        guildLookup(event.guildId), eventLookup(event.eventId), encrypted.keyVersion, encrypted.nonce,
        encrypted.tag, encrypted.payload, event.status, now, now,
    ]);
    return getEvent(event.guildId, event.eventId);
}

async function getEvent(guildId, eventId) {
    await ensureSchema();
    const rows = await database.query(`${eventSelect('WHERE e.guild_lookup = ? AND e.event_lookup = ?')} LIMIT 1`, [
        guildLookup(guildId), eventLookup(eventId),
    ]);
    return decodeRow(rows?.[0]);
}

async function listCurrentEvents(guildId) {
    await ensureSchema();
    const rows = await database.query(eventSelect('WHERE e.guild_lookup = ?'), [guildLookup(guildId)]);
    return rows.map(decodeRow).sort((left, right) => (
        ({ Live: 0, Scheduled: 1, Ended: 2 }[left.status] ?? 3) - ({ Live: 0, Scheduled: 1, Ended: 2 }[right.status] ?? 3)
        || Number(left.scheduledStartAtMs ?? Number.MAX_SAFE_INTEGER) - Number(right.scheduledStartAtMs ?? Number.MAX_SAFE_INTEGER)
        || left.eventId.localeCompare(right.eventId)
    ));
}

async function markEventEnded(guildId, eventId, { reason = 'canceled' } = {}) {
    const current = await getEvent(guildId, eventId);
    if (!current) return undefined;
    const ended = await upsertEvent({
        ...current,
        status: 'Ended',
        terminalReason: String(reason).slice(0, 32),
        sourceDeletedAtMs: Date.now(),
    });
    if (!ended.publicationState || ended.publicationState === 'deleted') {
        await removeTerminalEvent(ended.guildId, ended.eventId);
        return undefined;
    }
    return ended;
}

async function markMissingEventsEnded(guildId, observedEventIds) {
    await ensureSchema();
    const observed = new Set([...observedEventIds].map((eventId) => lookupKey(eventLookup(eventId))));
    const rows = await database.query(
        `SELECT event_lookup FROM ${EVENTS_TABLE} WHERE guild_lookup = ? AND event_status <> 'Ended'`,
        [guildLookup(guildId)],
    );
    const missing = rows.map((row) => row.event_lookup).filter((lookup) => !observed.has(lookupKey(lookup)));
    const events = await Promise.all(missing.map(async (lookup) => {
        const rowsForLookup = await database.query(`${eventSelect('WHERE e.guild_lookup = ? AND e.event_lookup = ?')} LIMIT 1`, [
            guildLookup(guildId), lookup,
        ]);
        const event = decodeRow(rowsForLookup?.[0]);
        return event ? markEventEnded(event.guildId, event.eventId, { reason: 'removed' }) : undefined;
    }));
    return events.filter(Boolean);
}

async function removeTerminalEvent(guildId, eventId) {
    await ensureSchema();
    const result = await database.query(`
        DELETE e, p
        FROM ${EVENTS_TABLE} e
        LEFT JOIN ${PUBLICATIONS_TABLE} p
            ON p.guild_lookup = e.guild_lookup AND p.event_lookup = e.event_lookup
        WHERE e.guild_lookup = ? AND e.event_lookup = ? AND e.event_status = 'Ended'
            AND (p.event_lookup IS NULL OR p.publication_state = 'deleted')
    `, [guildLookup(guildId), eventLookup(eventId)]);
    return Number(result?.affectedRows ?? 0) > 0 ? 1 : 0;
}

async function publishEvent(guildId, eventId) {
    await ensureSchema();
    const event = await getEvent(guildId, eventId);
    if (!event) {
        const error = new Error('The Discord scheduled event no longer exists in Warden’s mirror. Refresh the Events panel and try again.');
        error.code = 'SCHEDULED_EVENT_NOT_FOUND';
        throw error;
    }
    const now = Date.now();
    await database.query(`
        INSERT INTO ${PUBLICATIONS_TABLE} (guild_lookup, event_lookup, publication_state, published_at_ms)
        VALUES (?, ?, 'published', ?)
        ON DUPLICATE KEY UPDATE
            publication_state = 'published', published_at_ms = VALUES(published_at_ms),
            website_deletion_requested_at_ms = NULL, website_deletion_completed_at_ms = NULL
    `, [guildLookup(event.guildId), eventLookup(event.eventId), now]);
    return getEvent(event.guildId, event.eventId);
}

async function requestWebsiteDeletion(guildId, eventId) {
    await ensureSchema();
    const event = await getEvent(guildId, eventId);
    if (!event?.publicationState || event.publicationState === 'deleted') {
        const error = new Error('This scheduled event does not currently have a website post to delete.');
        error.code = 'SCHEDULED_EVENT_WEBSITE_POST_NOT_FOUND';
        throw error;
    }
    await database.query(`
        UPDATE ${PUBLICATIONS_TABLE}
        SET publication_state = 'delete_pending', website_deletion_requested_at_ms = ?, website_deletion_completed_at_ms = NULL
        WHERE guild_lookup = ? AND event_lookup = ?
    `, [Date.now(), guildLookup(event.guildId), eventLookup(event.eventId)]);
    return getEvent(event.guildId, event.eventId);
}

async function listSnapshotItems(guildId) {
    await ensureSchema();
    const rows = await database.query(`${eventSelect(`WHERE e.guild_lookup = ? AND p.publication_state IN ('published', 'delete_pending')`)}
        ORDER BY e.event_lookup ASC`, [guildLookup(guildId)]);
    return rows.map(decodeRow);
}

async function reservePublicationRevision(guildId) {
    await ensureSchema();
    const lookup = guildLookup(guildId);
    const result = await database.query(`
        INSERT INTO ${PUBLICATIONS_TABLE} (
            guild_lookup, event_lookup, publication_state, publication_revision, last_sync_attempt_at_ms
        ) VALUES (?, ?, 'sync_state', LAST_INSERT_ID(1), ?)
        ON DUPLICATE KEY UPDATE
            publication_revision = LAST_INSERT_ID(publication_revision + 1),
            last_sync_attempt_at_ms = VALUES(last_sync_attempt_at_ms)
    `, [lookup, SYNC_STATE_EVENT_LOOKUP, Date.now()]);
    const revision = Number(result?.insertId);
    if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new Error('Scheduled event website publication revision could not be reserved atomically.');
    }
    return revision;
}

async function completeWebsiteDeletions(guildId, eventIds) {
    await ensureSchema();
    const lookups = [...new Map(eventIds.map((eventId) => {
        const lookup = eventLookup(eventId);
        return [lookupKey(lookup), lookup];
    })).values()];
    if (lookups.length < 1) return 0;
    const placeholders = lookups.map(() => '?').join(', ');
    const result = await database.query(`
        UPDATE ${PUBLICATIONS_TABLE}
        SET publication_state = 'deleted', website_deletion_completed_at_ms = ?
        WHERE guild_lookup = ? AND publication_state = 'delete_pending' AND event_lookup IN (${placeholders})
    `, [Date.now(), guildLookup(guildId), ...lookups]);
    return Number(result?.affectedRows ?? 0);
}

async function cleanupDeliveredTerminalEvents(guildId, eventIds) {
    await ensureSchema();
    const ids = [...new Set(eventIds.map((eventId) => normalizeId(eventId, 'event ID')))];
    if (ids.length < 1) return 0;
    let removed = 0;
    for (const eventId of ids) {
        const event = await getEvent(guildId, eventId);
        if (event?.status !== 'Ended') continue;
        if (event.publicationState === 'published' || event.publicationState === 'deleted') {
            const result = await database.query(`
                DELETE e, p
                FROM ${EVENTS_TABLE} e
                INNER JOIN ${PUBLICATIONS_TABLE} p
                    ON p.guild_lookup = e.guild_lookup AND p.event_lookup = e.event_lookup
                WHERE e.guild_lookup = ? AND e.event_lookup = ? AND e.event_status = 'Ended'
                    AND p.publication_state IN ('published', 'deleted')
            `, [guildLookup(guildId), eventLookup(eventId)]);
            if (Number(result?.affectedRows ?? 0) > 0) removed += 1;
        }
    }
    return removed;
}

module.exports = {
    EVENTS_TABLE,
    PUBLICATIONS_TABLE,
    SYNC_STATE_EVENT_LOOKUP,
    cleanupDeliveredTerminalEvents,
    completeWebsiteDeletions,
    ensureSchema,
    getEvent,
    listCurrentEvents,
    listSnapshotItems,
    markEventEnded,
    markMissingEventsEnded,
    publishEvent,
    removeTerminalEvent,
    requestWebsiteDeletion,
    reservePublicationRevision,
    upsertEvent,
};
