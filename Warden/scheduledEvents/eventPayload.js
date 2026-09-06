'use strict';

const { renderDiscordMarkdown } = require('./discordMarkdown');

const STATUS = Object.freeze({
    1: 'Scheduled',
    2: 'Live',
    3: 'Ended',
    4: 'Ended',
});

const ENTITY_TYPES = Object.freeze({
    1: 'Stage',
    2: 'Voice',
    3: 'External',
});

function optionalString(value, maximum = 10_000) {
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, maximum) : null;
}

function requiredId(value, label) {
    const id = optionalString(value, 32);
    if (!id || !/^\d{16,32}$/u.test(id)) throw new Error(`Scheduled event requires a valid ${label}.`);
    return id;
}

function optionalTimestamp(value) {
    if (value == null || value === '') return null;
    const timestamp = Number(value instanceof Date ? value.getTime() : value);
    return Number.isFinite(timestamp) && timestamp >= 0 ? Math.trunc(timestamp) : null;
}

function scheduledEventStatus(value) {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'scheduled') return 'Scheduled';
        if (normalized === 'active' || normalized === 'live') return 'Live';
        if (normalized === 'completed' || normalized === 'canceled' || normalized === 'cancelled' || normalized === 'ended') return 'Ended';
    }
    return STATUS[Number(value)] ?? 'Scheduled';
}

function entityType(value) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 32);
    return ENTITY_TYPES[Number(value)] ?? 'Unknown';
}

function coverImageUrl(event) {
    if (typeof event?.coverImageURL !== 'function') return optionalString(event?.coverImageUrl, 2048);
    try {
        return optionalString(event.coverImageURL({ extension: 'png', size: 2048 }), 2048);
    }
    catch {
        return null;
    }
}

function eventUrl(event, guildId, eventId) {
    const direct = optionalString(event?.url, 2048);
    return direct ?? `https://discord.com/events/${guildId}/${eventId}`;
}

function cacheValue(cache, id) {
    return typeof cache?.get === 'function' ? cache.get(id) ?? null : null;
}

function markdownContext(event, guildId) {
    const guild = event?.guild;
    return {
        guildId,
        resolveUser(id) {
            const member = cacheValue(guild?.members?.cache, id);
            const user = member?.user ?? cacheValue(guild?.client?.users?.cache, id);
            if (!member && !user) return null;
            return { name: member?.displayName ?? user?.globalName ?? user?.username };
        },
        resolveRole(id) {
            const role = cacheValue(guild?.roles?.cache, id);
            return role ? { name: role.name } : null;
        },
        resolveChannel(id) {
            const channel = cacheValue(guild?.channels?.cache, id);
            return channel ? { name: channel.name } : null;
        },
    };
}

function normalizeScheduledEvent(event, { terminal = false, terminalReason, creatorName } = {}) {
    const guildId = requiredId(event?.guildId ?? event?.guild?.id, 'guild ID');
    const eventId = requiredId(event?.id, 'event ID');
    const creator = event?.creator;
    const status = terminal ? 'Ended' : scheduledEventStatus(event?.status);
    const cancelled = Number(event?.status) === 4 || /cancel/i.test(String(event?.status ?? ''));
    const description = optionalString(event?.description, 65_535);
    return Object.freeze({
        guildId,
        eventId,
        name: optionalString(event?.name, 100) ?? 'Untitled Discord Event',
        description,
        descriptionHtml: renderDiscordMarkdown(description ?? '', {
            ...markdownContext(event, guildId),
            maxOutputLength: 65_535,
        }),
        creatorId: optionalString(event?.creatorId ?? creator?.id, 32),
        creatorName: optionalString(
            creatorName ?? creator?.globalName ?? creator?.displayName ?? creator?.username ?? event?.creatorName,
            128,
        ),
        createdAtMs: optionalTimestamp(event?.createdTimestamp ?? event?.createdAt),
        scheduledStartAtMs: optionalTimestamp(event?.scheduledStartTimestamp ?? event?.scheduledStartAt),
        scheduledEndAtMs: optionalTimestamp(event?.scheduledEndTimestamp ?? event?.scheduledEndAt),
        status,
        terminalReason: status === 'Ended' ? (terminalReason ?? (cancelled ? 'canceled' : 'ended')) : null,
        entityType: entityType(event?.entityType),
        channelId: optionalString(event?.channelId ?? event?.channel?.id, 32),
        location: optionalString(event?.entityMetadata?.location ?? event?.location, 2_000),
        eventUrl: eventUrl(event, guildId, eventId),
        coverImageUrl: coverImageUrl(event),
        interestedCount: Number.isSafeInteger(event?.userCount) && event.userCount >= 0 ? event.userCount : null,
        sourceDeletedAtMs: terminal ? Date.now() : null,
    });
}

function publicEvent(row) {
    const creatorId = optionalString(row.creatorId, 32);
    const creatorName = optionalString(row.creatorName, 128);
    const creator = creatorId && /^\d{16,32}$/u.test(creatorId) && creatorName
        ? Object.freeze({ id: creatorId, name: creatorName })
        : null;
    const createdAtMs = timestampOrSnowflake(row.createdAtMs, row.eventId);
    const scheduledStartAtMs = timestampOrSnowflake(row.scheduledStartAtMs, row.eventId) ?? createdAtMs;
    return Object.freeze({
        id: String(row.eventId),
        guildId: String(row.guildId),
        name: String(row.name),
        description: String(row.description ?? ''),
        descriptionHtml: String(row.descriptionHtml ?? renderDiscordMarkdown(row.description ?? '', { maxOutputLength: 65_535 })),
        creator,
        createdAt: new Date(createdAtMs).toISOString(),
        scheduledStartAt: new Date(scheduledStartAtMs).toISOString(),
        scheduledEndAt: row.scheduledEndAtMs == null ? null : new Date(Number(row.scheduledEndAtMs)).toISOString(),
        status: String(row.status).toLowerCase(),
        entityType: String(row.entityType).toLowerCase(),
        channelId: row.channelId ?? null,
        location: row.location ?? null,
        url: String(row.eventUrl ?? `https://discord.com/events/${row.guildId}/${row.eventId}`),
        imageUrl: row.coverImageUrl ?? null,
        interestedCount: Number.isSafeInteger(row.interestedCount) && row.interestedCount >= 0 ? row.interestedCount : 0,
    });
}

function timestampOrSnowflake(value, snowflake) {
    const timestamp = optionalTimestamp(value);
    if (timestamp !== null) return timestamp;
    try {
        const id = BigInt(String(snowflake));
        const discordEpoch = 1420070400000n;
        const derived = Number((id >> 22n) + discordEpoch);
        return Number.isSafeInteger(derived) && derived >= 0 ? derived : null;
    }
    catch {
        return null;
    }
}

module.exports = {
    normalizeScheduledEvent,
    publicEvent,
    scheduledEventStatus,
};
