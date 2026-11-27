'use strict';

const crypto = require('node:crypto');
const https = require('node:https');
const { URL } = require('node:url');
const { createConsoleReporter } = require('../../logging/consoleReporting');
const { publicEvent } = require('./eventPayload');
const repository = require('./repository');

const ENDPOINT_PATH = '/axi-events/v1/sync';
const REQUEST_TIMEOUT_MS = 30_000;
const RESPONSE_LIMIT_BYTES = 64 * 1024;
const PAYLOAD_LIMIT_BYTES = 1024 * 1024;
const AUTOMATIC_DEBOUNCE_MS = 15_000;
const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504, 508]);
const RETRYABLE_NETWORK_ERRORS = new Set([
    'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE',
    'ENETUNREACH', 'EHOSTUNREACH', 'ERR_STREAM_PREMATURE_CLOSE',
]);
const PERMANENT_BRIDGE_ERRORS = new Set([
    'bridge_unconfigured', 'invalid_target', 'invalid_additional_taxonomy', 'invalid_additional_terms', 'trash_unavailable',
]);
const report = createConsoleReporter('Scheduled Events').forSubsystem('Website');
const operations = new Map();

function requiredEnvironment() {
    const url = String(process.env.AXI_EVENTS_SYNC_URL ?? '').trim();
    const keyId = String(process.env.AXI_EVENTS_SYNC_KEY_ID ?? '').trim();
    const secret = String(process.env.AXI_EVENTS_SYNC_SECRET ?? '').trim();
    if (!url && !keyId && !secret) return undefined;
    if (!url || !keyId || !secret) {
        throw new Error('Scheduled event website publishing requires AXI_EVENTS_SYNC_URL, AXI_EVENTS_SYNC_KEY_ID, and AXI_EVENTS_SYNC_SECRET together.');
    }
    if (!/^[a-z0-9_-]{1,64}$/u.test(keyId)) {
        throw new Error('AXI_EVENTS_SYNC_KEY_ID must contain 1–64 lowercase letters, numbers, dashes, or underscores.');
    }
    if (secret.length < 32) {
        throw new Error('AXI_EVENTS_SYNC_SECRET must contain at least 32 characters.');
    }
    let endpoint;
    try { endpoint = new URL(url); }
    catch { throw new Error('AXI_EVENTS_SYNC_URL must be a valid HTTPS URL.'); }
    const suffix = `/wp-json${ENDPOINT_PATH}`;
    if (endpoint.protocol !== 'https:' || !endpoint.pathname.endsWith(suffix)
        || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error(`AXI_EVENTS_SYNC_URL must target an HTTPS ${suffix} endpoint, optionally below the WordPress installation path.`);
    }
    return { endpoint, keyId, secret };
}

function isWebsiteSyncConfigured() {
    return Boolean(requiredEnvironment());
}

function websiteHttpError(response, responseChunks) {
    const error = new Error(`Scheduled event website returned HTTP ${response.statusCode}.`);
    let bridgeCode;
    try { bridgeCode = JSON.parse(Buffer.concat(responseChunks).toString('utf8'))?.code; }
    catch { bridgeCode = undefined; }
    error.retryable = RETRYABLE_HTTP_STATUS.has(response.statusCode) && !PERMANENT_BRIDGE_ERRORS.has(bridgeCode);
    const header = response.headers?.['retry-after'];
    if (error.retryable && typeof header === 'string') {
        const delayMs = (/^\d+$/u).test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
        if (Number.isFinite(delayMs) && delayMs > 0) error.retryAfterMs = delayMs;
    }
    return error;
}

async function buildSnapshot(guildId, revision) {
    const items = await repository.listSnapshotItems(guildId);
    const events = items
        .filter((item) => item.publicationState === 'published')
        .map(publicEvent);
    const deletions = items
        .filter((item) => item.publicationState === 'delete_pending')
        .map((item) => item.eventId);
    return {
        schemaVersion: 2,
        guildId: String(guildId),
        revision: Number(revision),
        generatedAt: new Date().toISOString(),
        events,
        deletions,
    };
}

function sendSignedPayload(config, payload, signal) {
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    if (rawBody.length > PAYLOAD_LIMIT_BYTES) throw new Error('Scheduled event website payload exceeds the 1 MiB endpoint limit.');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(18).toString('base64url');
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const canonical = `POST\n${ENDPOINT_PATH}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const signature = crypto.createHmac('sha256', config.secret).update(canonical, 'utf8').digest('hex');
    return new Promise((resolve, reject) => {
        const request = https.request(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': rawBody.length,
                'X-AXI-Key-Id': config.keyId,
                'X-AXI-Timestamp': timestamp,
                'X-AXI-Nonce': nonce,
                'X-AXI-Content-SHA256': bodyHash,
                'X-AXI-Signature': signature,
            },
            timeout: REQUEST_TIMEOUT_MS,
            signal,
        }, (response) => {
            let responseBytes = 0;
            const responseChunks = [];
            response.on('data', (chunk) => {
                responseBytes += chunk.length;
                if (responseBytes > RESPONSE_LIMIT_BYTES) request.destroy(new Error('Scheduled event website response exceeded 64 KiB.'));
                else responseChunks.push(chunk);
            });
            response.once('error', reject);
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(websiteHttpError(response, responseChunks));
                }
                else {
                    let body;
                    try {
                        body = JSON.parse(Buffer.concat(responseChunks).toString('utf8'));
                    }
                    catch {
                        reject(Object.assign(new Error('Scheduled event website returned an invalid success response.'), {
                            retryable: true,
                        }));
                        return;
                    }
                    if (body?.success !== true || Number(body?.revision) !== Number(payload.revision)) {
                        reject(new Error('Scheduled event website did not confirm the submitted snapshot revision.'));
                        return;
                    }
                    resolve({ statusCode: response.statusCode, responseBytes, body });
                }
            });
        });
        request.once('timeout', () => request.destroy(Object.assign(
            new Error('Scheduled event website request timed out.'), { code: 'ETIMEDOUT' },
        )));
        request.once('error', reject);
        request.end(rawBody);
    });
}

async function publishSnapshot(guildId, { reason, signal }) {
    if (await repository.isWebsiteSyncPaused(guildId) || signal.aborted) return { skipped: 'paused' };
    const config = requiredEnvironment();
    if (!config) return { skipped: 'unconfigured' };
    const initial = await repository.listSnapshotItems(guildId);
    if (initial.length < 1) return { skipped: 'no-publications' };
    const revision = await repository.reservePublicationRevision(guildId);
    if (revision == null) return { skipped: 'no-publications' };
    const snapshot = await buildSnapshot(guildId, revision);
    if (await repository.isWebsiteSyncPaused(guildId) || signal.aborted) return { skipped: 'paused' };
    let response;
    try {
        response = await sendSignedPayload(config, snapshot, signal);
    }
    catch (error) {
        if (signal.aborted) return { skipped: 'paused' };
        if (RETRYABLE_NETWORK_ERRORS.has(error.code)) error.retryable = true;
        throw error;
    }
    const completedDeletions = await repository.completeWebsiteDeletions(guildId, snapshot.deletions);
    const cleanedTerminalEvents = await repository.cleanupDeliveredTerminalEvents(
        guildId,
        [
            ...snapshot.events.filter((event) => event.status === 'ended').map((event) => event.id),
            ...snapshot.deletions,
        ],
    );
    report.success('Snapshot published', {
        reason,
        revision: snapshot.revision,
        events: snapshot.events.length,
        deletions: completedDeletions,
        terminalEventsCleaned: cleanedTerminalEvents,
    });
    return { snapshot, response, completedDeletions, cleanedTerminalEvents };
}

function requestWebsiteSync(guildId, { reason = 'automatic', debounceMs = 0 } = {}) {
    const key = String(guildId);
    const requestedDebounceMs = Number.isFinite(debounceMs) && debounceMs > 0 ? Math.trunc(debounceMs) : 0;
    const current = operations.get(key);
    if (current) {
        current.pending = true;
        current.reason = reason === 'manual' || reason === 'startup' ? reason : current.reason;
        if (requestedDebounceMs === 0 && current.timer) {
            clearTimeout(current.timer);
            current.timer = undefined;
            void current.run();
        }
        return current.promise;
    }
    const state = {
        reason,
        pending: false,
        running: false,
        cancelled: false,
        controller: new AbortController(),
        timer: undefined,
        promise: undefined,
        run: undefined,
        cancel: undefined,
    };
    state.promise = new Promise((resolve, reject) => {
        state.run = async () => {
            if (state.running || state.cancelled) return;
            state.running = true;
            try {
                let lastResult;
                do {
                    state.pending = false;
                    lastResult = await publishSnapshot(key, { reason: state.reason, signal: state.controller.signal });
                } while (state.pending && !state.cancelled);
                resolve(lastResult);
            }
            catch (error) {
                reject(error);
            }
        };
        state.cancel = (reason = 'shutdown') => {
            if (state.cancelled || (state.running && reason === 'shutdown')) return;
            state.cancelled = true;
            if (state.timer) clearTimeout(state.timer);
            state.timer = undefined;
            if (state.running) state.controller.abort();
            else resolve({ skipped: reason });
        };
        if (requestedDebounceMs > 0) {
            state.timer = setTimeout(() => {
                state.timer = undefined;
                void state.run();
            }, requestedDebounceMs);
            state.timer.unref?.();
        }
        else void state.run();
    }).finally(() => {
        if (operations.get(key) === state) operations.delete(key);
    });
    operations.set(key, state);
    return state.promise;
}

function requestAutomaticWebsiteSync(guildId, reason = 'event update') {
    return requestWebsiteSync(guildId, { reason, debounceMs: AUTOMATIC_DEBOUNCE_MS });
}

function pauseWebsiteSync(guildId) {
    operations.get(String(guildId))?.cancel('paused');
}

async function shutdown() {
    const pending = [...operations.values()];
    for (const state of pending) state.cancel?.();
    await Promise.allSettled(pending.map((state) => state.promise));
    operations.clear();
}

module.exports = {
    AUTOMATIC_DEBOUNCE_MS,
    ENDPOINT_PATH,
    PAYLOAD_LIMIT_BYTES,
    REQUEST_TIMEOUT_MS,
    buildSnapshot,
    isWebsiteSyncConfigured,
    pauseWebsiteSync,
    requestAutomaticWebsiteSync,
    requestWebsiteSync,
    sendSignedPayload,
    shutdown,
};
