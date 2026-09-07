'use strict';

const { Routes } = require('discord.js');
const { botIdent } = require('../../functions');
const { createConsoleReporter } = require('../../logging/consoleReporting');
const { normalizeScheduledEvent } = require('./eventPayload');
const repository = require('./repository');
const publisher = require('./websitePublisher');

const report = createConsoleReporter('Scheduled Events').forSubsystem('Lifecycle');
const DAILY_RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_RETRY_DELAY_MS = 60_000;

let lifecycle;
let reconciliation;
let initialization;
let lifecycleGeneration = 0;
const guildMutations = new Map();

function configuredGuildId() {
    return String(process.env.GUILDID ?? botIdent().activeBot?.guildId ?? '').trim();
}

function assertWardenGuild(guildId) {
    const configured = configuredGuildId();
    const actual = String(guildId ?? '').trim();
    if (!configured || actual !== configured) {
        const error = new Error('Scheduled event publishing is available only in Warden’s configured server.');
        error.code = 'SCHEDULED_EVENTS_GUILD_MISMATCH';
        throw error;
    }
    return actual;
}

function eventGuildId(event) {
    return String(event?.guildId ?? event?.guild?.id ?? '').trim();
}

async function resolveCreatorDisplayName(event) {
    const creatorId = String(event?.creatorId ?? event?.creator?.id ?? '').trim();
    const members = event?.guild?.members;
    if (!creatorId || !members) return undefined;
    const cached = members.cache?.get?.(creatorId);
    if (cached?.displayName) return cached.displayName;
    if (typeof members.fetch !== 'function') return undefined;
    try {
        const member = await members.fetch(creatorId);
        return member?.displayName || undefined;
    }
    catch {
        return undefined;
    }
}

async function normalizeWithCreatorDisplayName(event, options) {
    const creatorName = await resolveCreatorDisplayName(event);
    return {
        event: normalizeScheduledEvent(event, { ...options, creatorName }),
        resolvedCreatorName: creatorName,
    };
}

function preserveCreatorDisplayName(normalized, resolvedCreatorName, existing) {
    if (resolvedCreatorName || !existing?.creatorName) return normalized;
    return { ...normalized, creatorName: existing.creatorName };
}

function runGuildMutation(guildId, work) {
    const key = String(guildId);
    const previous = guildMutations.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    guildMutations.set(key, next);
    return next.finally(() => {
        if (guildMutations.get(key) === next) guildMutations.delete(key);
    });
}

function schedulePublicationSync(event, guildId, reason) {
    if (!['published', 'delete_pending'].includes(event?.publicationState)) return;
    if (lifecycle?.automaticSyncTimers?.has(guildId)) return;
    const timer = setTimeout(() => {
        lifecycle?.automaticSyncTimers?.delete(guildId);
        void runGuildMutation(guildId, () => publisher.requestWebsiteSync(guildId, { reason }))
            .catch((error) => report.warn('Automatic website sync failed', error));
    }, publisher.AUTOMATIC_DEBOUNCE_MS);
    timer.unref?.();
    if (lifecycle) lifecycle.automaticSyncTimers.set(guildId, timer);
}

async function handleCreate(event) {
    const guildId = assertWardenGuild(eventGuildId(event));
    const saved = await runGuildMutation(guildId, async () => {
        const resolved = await normalizeWithCreatorDisplayName(event);
        let normalized = resolved.event;
        const existing = await repository.getEvent(guildId, normalized.eventId);
        if (existing?.status === 'Ended') return existing;
        normalized = preserveCreatorDisplayName(normalized, resolved.resolvedCreatorName, existing);
        return repository.upsertEvent(normalized);
    });
    schedulePublicationSync(saved, guildId, 'event created');
    return saved;
}

async function handleUpdate(_oldEvent, newEvent) {
    const guildId = assertWardenGuild(eventGuildId(newEvent));
    const saved = await runGuildMutation(guildId, async () => {
        const resolved = await normalizeWithCreatorDisplayName(newEvent);
        let normalized = resolved.event;
        const existing = await repository.getEvent(guildId, normalized.eventId);
        if (existing?.status === 'Ended' && normalized.status !== 'Ended') return existing;
        try {
            const fresh = await newEvent.client.rest.get(Routes.guildScheduledEvent(guildId, normalized.eventId), {
                query: new URLSearchParams({ with_user_count: 'true' }),
            });
            if (!Number.isSafeInteger(fresh.user_count) || fresh.user_count < 0) {
                throw new Error('Discord returned an invalid scheduled event interested count.');
            }
            normalized = { ...normalized, interestedCount: fresh.user_count };
        }
        catch (error) {
            normalized = { ...normalized, interestedCount: existing?.interestedCount ?? null };
            report.warn('Interested count refresh failed; retaining stored count', error);
        }
        normalized = preserveCreatorDisplayName(normalized, resolved.resolvedCreatorName, existing);
        const next = await repository.upsertEvent(normalized);
        if (next.status === 'Ended' && (!next.publicationState || next.publicationState === 'deleted')) {
            await repository.removeTerminalEvent(guildId, next.eventId);
            return undefined;
        }
        return next;
    });
    schedulePublicationSync(saved, guildId, 'event updated');
    return saved;
}

async function handleDelete(event) {
    const guildId = assertWardenGuild(eventGuildId(event));
    const normalized = normalizeScheduledEvent(event, { terminal: true, terminalReason: 'canceled' });
    const saved = await runGuildMutation(guildId, async () => {
        const existing = await repository.getEvent(guildId, normalized.eventId);
        if (!existing) {
            await repository.upsertEvent(normalized);
            await repository.removeTerminalEvent(guildId, normalized.eventId);
            return undefined;
        }
        return repository.markEventEnded(guildId, normalized.eventId, { reason: normalized.terminalReason });
    });
    schedulePublicationSync(saved, guildId, 'event removed');
    return saved;
}

async function applyInterestedCount(event, delta) {
    const guildId = assertWardenGuild(eventGuildId(event));
    const saved = await runGuildMutation(guildId, async () => {
        const normalized = normalizeScheduledEvent(event);
        const existing = await repository.getEvent(guildId, normalized.eventId);
        if (existing?.status === 'Ended') return existing;
        if (!existing) return repository.upsertEvent(normalized);
        const baseCount = Number.isSafeInteger(existing.interestedCount) && existing.interestedCount >= 0
            ? existing.interestedCount
            : Number.isSafeInteger(event?.userCount) && event.userCount >= 0 ? event.userCount : null;
        if (baseCount === null) return existing;
        return repository.upsertEvent({
            ...normalized,
            creatorName: existing.creatorName ?? normalized.creatorName,
            interestedCount: Math.max(0, baseCount + delta),
        });
    });
    schedulePublicationSync(saved, guildId, 'interest changed');
    return saved;
}

function handleUserAdd(event) {
    return applyInterestedCount(event, 1);
}

function handleUserRemove(event) {
    return applyInterestedCount(event, -1);
}

async function reconcile(guild, { reason = 'manual' } = {}) {
    const guildId = assertWardenGuild(guild?.id);
    const result = await runGuildMutation(guildId, async () => {
        const fetched = await guild.scheduledEvents.fetch();
        const saved = [];
        const eventIds = [];
        for (const sourceEvent of fetched.values()) {
            const resolved = await normalizeWithCreatorDisplayName(sourceEvent);
            let event = resolved.event;
            eventIds.push(event.eventId);
            const existing = await repository.getEvent(guildId, event.eventId);
            if (existing?.status === 'Ended' && event.status !== 'Ended') saved.push(existing);
            else {
                event = preserveCreatorDisplayName(event, resolved.resolvedCreatorName, existing);
                saved.push(await repository.upsertEvent(event));
            }
        }
        const terminalized = await repository.markMissingEventsEnded(guildId, eventIds);
        const sync = await publisher.requestWebsiteSync(guildId, { reason });
        return { saved, terminalized, sync };
    });
    report.success('Reconciliation completed', {
        reason,
        mirrored: result.saved.length,
        terminalized: result.terminalized.length,
        sync: result.sync.skipped ?? 'published',
    });
    return { mirrored: result.saved.length, terminalized: result.terminalized.length, sync: result.sync };
}

function startLifecycle(guild) {
    if (lifecycle) return;
    lifecycle = {
        guild,
        generation: lifecycleGeneration,
        automaticSyncTimers: new Map(),
        retryTimer: undefined,
        timer: setInterval(() => {
            void reconcileLifecycle('daily');
        }, DAILY_RECONCILIATION_INTERVAL_MS),
    };
    lifecycle.timer.unref?.();
}

async function reconcileLifecycle(reason) {
    if (!lifecycle || reconciliation) return reconciliation;
    const activeLifecycle = lifecycle;
    reconciliation = reconcile(activeLifecycle.guild, { reason })
        .catch((error) => {
            if (lifecycle === activeLifecycle && activeLifecycle.generation === lifecycleGeneration) {
                report.warn('Scheduled reconciliation failed', error, { reason });
                scheduleStartupRetry(activeLifecycle);
            }
            return { failed: true };
        })
        .finally(() => { reconciliation = undefined; });
    return reconciliation;
}

function scheduleStartupRetry(activeLifecycle) {
    if (activeLifecycle.retryTimer || lifecycle !== activeLifecycle) return;
    activeLifecycle.retryTimer = setTimeout(() => {
        activeLifecycle.retryTimer = undefined;
        void reconcileLifecycle('startup retry');
    }, STARTUP_RETRY_DELAY_MS);
    activeLifecycle.retryTimer.unref?.();
}

async function initialize({ guild, guildId } = {}) {
    const normalizedGuildId = assertWardenGuild(guildId ?? guild?.id);
    if (!guild || String(guild.id) !== normalizedGuildId) {
        throw new Error('Scheduled event startup requires Warden’s configured guild.');
    }
    startLifecycle(guild);
    const activeLifecycle = lifecycle;
    const attempt = (async () => {
        await repository.ensureSchema();
        return reconcile(guild, { reason: 'startup' });
    })();
    initialization = attempt;
    try {
        return await initialization;
    }
    catch (error) {
        if (lifecycle === activeLifecycle && activeLifecycle.generation === lifecycleGeneration) {
            scheduleStartupRetry(activeLifecycle);
        }
        throw error;
    }
    finally {
        if (initialization === attempt) initialization = undefined;
    }
}

async function listCurrentEvents(guildId) {
    return repository.listCurrentEvents(assertWardenGuild(guildId));
}

async function publishEvent(guildId, eventId) {
    const normalizedGuildId = assertWardenGuild(guildId);
    assertWebsiteConfigured();
    const { event, sync } = await runGuildMutation(normalizedGuildId, async () => ({
        event: await repository.publishEvent(normalizedGuildId, eventId),
        sync: await publisher.requestWebsiteSync(normalizedGuildId, { reason: 'admin publish' }),
    }));
    assertWebsiteSyncCompleted(sync);
    return { event, sync };
}

async function requestWebsiteDeletion(guildId, eventId) {
    const normalizedGuildId = assertWardenGuild(guildId);
    assertWebsiteConfigured();
    const { event, sync } = await runGuildMutation(normalizedGuildId, async () => ({
        event: await repository.requestWebsiteDeletion(normalizedGuildId, eventId),
        sync: await publisher.requestWebsiteSync(normalizedGuildId, { reason: 'admin delete' }),
    }));
    assertWebsiteSyncCompleted(sync);
    return { event, sync };
}

function requestWebsiteSync(guildId, options) {
    const normalizedGuildId = assertWardenGuild(guildId);
    return runGuildMutation(normalizedGuildId, () => publisher.requestWebsiteSync(normalizedGuildId, options));
}

async function shutdown() {
    lifecycleGeneration += 1;
    const activeLifecycle = lifecycle;
    if (lifecycle?.timer) clearInterval(lifecycle.timer);
    if (lifecycle?.retryTimer) clearTimeout(lifecycle.retryTimer);
    for (const timer of lifecycle?.automaticSyncTimers?.values() ?? []) clearTimeout(timer);
    lifecycle = undefined;
    await Promise.allSettled([
        initialization,
        reconciliation,
        ...guildMutations.values(),
    ].filter(Boolean));
    await publisher.shutdown();
    if (activeLifecycle?.generation === lifecycleGeneration) lifecycle = undefined;
}

function assertWebsiteConfigured() {
    if (publisher.isWebsiteSyncConfigured()) return;
    const error = new Error('Scheduled event website publishing is not configured. Set AXI_EVENTS_SYNC_URL, AXI_EVENTS_SYNC_KEY_ID, and AXI_EVENTS_SYNC_SECRET.');
    error.code = 'SCHEDULED_EVENTS_WEBSITE_SYNC_UNCONFIGURED';
    throw error;
}

function assertWebsiteSyncCompleted(sync) {
    if (!sync?.skipped) return;
    const error = new Error(`Scheduled event website publishing was skipped (${sync.skipped}). No website change was confirmed.`);
    error.code = 'SCHEDULED_EVENTS_WEBSITE_SYNC_SKIPPED';
    throw error;
}

module.exports = {
    assertWardenGuild,
    assertWebsiteConfigured,
    handleCreate,
    handleDelete,
    handleUpdate,
    handleUserAdd,
    handleUserRemove,
    initialize,
    listCurrentEvents,
    publishEvent,
    reconcile,
    requestWebsiteDeletion,
    requestWebsiteSync,
    runGuildMutation,
    startLifecycle,
    shutdown,
};
