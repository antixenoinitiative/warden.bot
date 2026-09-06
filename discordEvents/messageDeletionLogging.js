const Discord = require('discord.js')

const RECONCILIATION_DELAY_MS = 1_500
const AUDIT_RECONCILIATION_DELAYS_MS = [500, 1_000, 1_500]
const AUDIT_ENTRY_MAX_AGE_MS = 30_000
const AUDIT_BUFFER_TTL_MS = 60_000
const AUDIT_SUMMARY_TTL_MS = 10 * 60_000
const AUDIT_BUFFER_MAX_ENTRIES = 320
const SELF_DELETE = Symbol('self-delete')

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function collectionValues(collection) {
    if (!collection) return []
    if (typeof collection.values === 'function') return Array.from(collection.values())
    if (typeof collection.first === 'function') {
        const first = collection.first()
        return first ? [first] : []
    }
    return Array.isArray(collection) ? collection : []
}

const auditChannelId = (entry) => entry?.extra?.channel?.id ?? entry?.extra?.channelId ?? null
const auditTargetId = (entry) => entry?.target?.id ?? entry?.targetId ?? null
const auditExecutorId = (entry) => entry?.executor?.id ?? entry?.executorId ?? null
const bulkAuditChannelId = (entry) => entry?.target?.id ?? auditChannelId(entry)

function auditCount(entry) {
    const count = Number(entry?.extra?.count)
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1
}

function entryTimestamp(entry) {
    return Number(entry?.createdTimestamp ?? entry?.createdAt?.getTime?.() ?? 0)
}

function auditEntryKey(entry, type) {
    const channelId = type === 73 ? bulkAuditChannelId(entry) : auditChannelId(entry)
    return `${type}:${String(entry?.id ?? `${auditExecutorId(entry) ?? ''}:${entryTimestamp(entry)}:${auditTargetId(entry) ?? ''}:${channelId ?? ''}`)}`
}

function messageTimestamp(message) {
    const cached = Number(message?.createdTimestamp)
    if (Number.isSafeInteger(cached) && cached > 0) return cached
    const createdAt = Number(message?.createdAt?.getTime?.())
    if (Number.isSafeInteger(createdAt) && createdAt > 0) return createdAt
    if (typeof message?.id !== 'string' || !/^[1-9]\d{16,18}$/u.test(message.id)) return null
    const timestamp = discordTimestamp(message.id)
    return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null
}

function discordTimestamp(id) {
    try {
        return Number(Discord.SnowflakeUtil.timestampFrom(id))
    } catch {
        return null
    }
}

function messageCreatedAt(message) {
    const timestamp = messageTimestamp(message)
    return timestamp == null ? '' : new Date(timestamp).toISOString()
}

function attachmentUrls(message) {
    const attachments = message?.attachments
    const values = attachments?.values ? Array.from(attachments.values()) : Array.isArray(attachments) ? attachments : []
    return values.map((attachment) => attachment?.url ?? attachment?.proxyURL ?? String(attachment ?? ''))
        .filter(Boolean)
        .join('\n')
}

function csvEscape(value) {
    const raw = String(value ?? '')
    const safe = /^[\s]*[=+\-@]/u.test(raw) ? `'${raw}` : raw
    return `"${safe.replace(/"/gu, '""')}"`
}

function sortMessages(messages) {
    return [...messages].sort((left, right) => (messageTimestamp(left) ?? Number.MAX_SAFE_INTEGER) - (messageTimestamp(right) ?? Number.MAX_SAFE_INTEGER)
        || String(left?.id ?? '').localeCompare(String(right?.id ?? '')))
}

function buildBulkCsv(messages) {
    const rows = sortMessages(messages)
        .map((message) => {
            const author = message?.author
            const authorName = message?.member?.displayName
                ?? author?.globalName
                ?? author?.username
                ?? author?.tag
                ?? ''
            const recovered = Boolean(author?.id) && !message?.partial
            return [
                message?.id ?? '', author?.id ?? '', authorName, messageCreatedAt(message),
                message?.content ?? '', attachmentUrls(message),
                recovered ? 'recovered' : 'record unavailable',
            ].map(csvEscape).join(',')
        })
    return `${[
        'message_id,author_id,author_name,message_created_at,content,attachment_urls,record_status',
        ...rows,
    ].join('\n')}\n`
}

function makeNormalDeletionEmbeds({ buildCopyableMessageEmbeds, message, deletedBy }) {
    const author = message?.author
    const member = message?.member ?? message?.guild?.members?.cache?.get?.(author?.id)
    const name = member?.displayName ?? author?.globalName ?? author?.username ?? author?.tag ?? 'Unknown message author'
    const avatarSource = typeof member?.displayAvatarURL === 'function' ? member : author
    const iconURL = typeof avatarSource?.displayAvatarURL === 'function' ? avatarSource.displayAvatarURL({ dynamic: true }) : undefined
    const timestamp = messageTimestamp(message)
    const channelId = messageChannelId(message)
    const contentFooter = [
        timestamp == null ? null : `Created at: <t:${Math.floor(timestamp / 1000)}:F>`,
        `Channel: ${channelId ? `<#${channelId}>` : 'record unavailable'}`,
    ].filter(Boolean).join('\n')
    const deletedByText = deletedBy === SELF_DELETE
        ? 'self-delete (or record unavailable)'
        : deletedBy?.id ? `<@${deletedBy.id}>` : 'record unavailable'
    return buildCopyableMessageEmbeds({
        title: 'Message Deleted 🗑️',
        searchableText: `Deleted by: ${deletedByText}\nMessage Author: ${author?.id ? `<@${author.id}>` : 'record unavailable'}`,
        contentLabel: 'Message', content: message?.content != null ? message.content : 'Cache Empty',
        contentFooter,
        author: iconURL ? { name, iconURL } : { name },
    })
}

function sameId(left, right) {
    return left != null && right != null && String(left) === String(right)
}

function messageChannelId(message) {
    return message?.channelId ?? message?.channel?.id
}

function isRecent(entry, currentTime) {
    const timestamp = entryTimestamp(entry)
    return timestamp > 0 && Math.abs(currentTime - timestamp) <= AUDIT_ENTRY_MAX_AGE_MS
}

function createMessageDeletionLogger({
    botLog,
    buildCopyableMessageEmbeds,
    discord = Discord,
    wait = sleep,
    batchDelay = RECONCILIATION_DELAY_MS,
    reconciliationDelays = AUDIT_RECONCILIATION_DELAYS_MS,
    now = Date.now,
    setCleanupTimer = setTimeout,
} = {}) {
    if (typeof botLog !== 'function') throw new Error('A botLog function is required.')
    if (typeof buildCopyableMessageEmbeds !== 'function') throw new Error('A message embed builder is required.')

    const guildStates = new Map()
    let cleanupTimer = null

    function sweepExpiredState() {
        const currentTime = now()
        for (const [guildId, state] of guildStates) {
            pruneState(state, currentTime)
            if (!state.records.size && !state.summaries.size && !state.events.length && !state.queue && !state.worker) guildStates.delete(guildId)
        }
        return guildStates.size
    }

    function scheduleCleanup() {
        if (cleanupTimer || !guildStates.size) return
        cleanupTimer = setCleanupTimer(() => {
            cleanupTimer = null
            sweepExpiredState()
            scheduleCleanup()
        }, AUDIT_BUFFER_TTL_MS)
        cleanupTimer?.unref?.()
    }

    function stateForGuild(guildId) {
        const existing = guildStates.get(guildId)
        const state = existing ?? { records: new Map(), summaries: new Map(), events: [], order: 0, queue: null, worker: null }
        guildStates.set(guildId, state)
        if (!existing) scheduleCleanup()
        pruneState(state, now())
        return state
    }

    function pruneState(state, currentTime) {
        for (const [key, record] of state.records) if (record.expiresAt <= currentTime) state.records.delete(key)
        const recent = [...state.records.entries()].sort(([, left], [, right]) => (
            right.expiresAt - left.expiresAt || entryTimestamp(right.entry) - entryTimestamp(left.entry)))
        for (const [key] of recent.slice(AUDIT_BUFFER_MAX_ENTRIES)) state.records.delete(key)
        for (const [key, summary] of state.summaries) if (summary.expiresAt <= currentTime) state.summaries.delete(key)
        while (state.summaries.size > AUDIT_BUFFER_MAX_ENTRIES) state.summaries.delete(state.summaries.keys().next().value)
        for (const summary of state.summaries.values()) summary.segments = summary.segments
            .filter((segment) => segment.remaining > 0).slice(-AUDIT_BUFFER_MAX_ENTRIES)
    }

    function mergeSummaries(state, entries, currentTime) {
        for (const entry of entries) {
            const key = auditEntryKey(entry, 72)
            const count = auditCount(entry)
            let summary = state.summaries.get(key)
            if (!summary) {
                summary = {
                    highWaterCount: count, segments: [],
                }
                if (isRecent(entry, currentTime)) summary.segments.push({
                    remaining: count, observedAt: entryTimestamp(entry),
                })
                state.summaries.set(key, summary)
            } else if (count > summary.highWaterCount) {
                summary.segments.push({
                    remaining: count - summary.highWaterCount, observedAt: currentTime,
                })
                summary.highWaterCount = count
            }
            const executorId = auditExecutorId(entry)
            const targetId = auditTargetId(entry)
            const channelId = auditChannelId(entry)
            if (executorId) summary.executor = entry.executor ?? { id: executorId }
            else if (!Object.hasOwn(summary, 'executor')) summary.executor = null
            if (targetId != null) summary.targetId = targetId
            else if (!Object.hasOwn(summary, 'targetId')) summary.targetId = null
            if (channelId != null) summary.channelId = channelId
            else if (!Object.hasOwn(summary, 'channelId')) summary.channelId = null
            summary.expiresAt = currentTime + AUDIT_SUMMARY_TTL_MS
            state.summaries.delete(key)
            state.summaries.set(key, summary)
        }
    }

    function mergeEntries(state, type, entries, preferCurrent = false) {
        const currentTime = now()
        if (type === 72) {
            mergeSummaries(state, entries, currentTime)
            pruneState(state, currentTime)
            scheduleCleanup()
            return
        }
        for (const entry of entries) {
            if (!entry?.executor?.id) continue
            const key = auditEntryKey(entry, type)
            const existing = state.records.get(key)
            const record = existing ?? { bulkConsumed: false }
            record.entry = preferCurrent || !existing || entryTimestamp(entry) >= entryTimestamp(existing.entry)
                ? entry : existing.entry
            record.count = Math.max(record.count ?? 0, auditCount(entry))
            record.expiresAt = currentTime + AUDIT_BUFFER_TTL_MS
            state.records.set(key, record)
        }
        pruneState(state, currentTime)
        scheduleCleanup()
    }

    async function fetchEntries(guild, state, type) {
        const logs = await guild.fetchAuditLogs({ type, limit: 20 })
        mergeEntries(state, type, collectionValues(logs?.entries), true)
    }

    function allocationFor(summaries, events) {
        const segments = summaries.flatMap((summary) => summary.segments)
            .filter((segment) => segment.remaining > 0)
            .sort((left, right) => left.observedAt - right.observedAt)
        const used = new Map()
        for (const event of events) {
            const candidate = segments.find((segment) => (
                segment.remaining - (used.get(segment) ?? 0) > 0
                && Math.abs(segment.observedAt - event.createdAt) <= AUDIT_ENTRY_MAX_AGE_MS
            ))
            if (!candidate) return null
            used.set(candidate, (used.get(candidate) ?? 0) + 1)
        }
        return used
    }

    function reconcileEvents(state) {
        const groups = new Map()
        for (const event of state.events) {
            if (event.executor) continue
            const key = `${event.authorId}\0${event.channelId}`
            groups.set(key, [...(groups.get(key) ?? []), event])
        }
        for (const events of groups.values()) {
            const ordered = [...events].sort((left, right) => left.order - right.order)
            const byExecutor = new Map()
            for (const summary of state.summaries.values()) {
                if (!sameId(summary.targetId, ordered[0].authorId) || !sameId(summary.channelId, ordered[0].channelId)) continue
                for (const event of ordered) event.matchingEvidence = true
                if (!summary.segments.some((segment) => segment.remaining > 0
                    && ordered.some((event) => Math.abs(segment.observedAt - event.createdAt) <= AUDIT_ENTRY_MAX_AGE_MS))) continue
                const executorId = summary.executor?.id
                if (!executorId) continue
                byExecutor.set(executorId, [...(byExecutor.get(executorId) ?? []), summary])
            }
            if (byExecutor.size > 1) {
                for (const event of ordered) event.executorAmbiguity = true
                quarantineEligibleCapacity(state, ordered)
                continue
            }
            const summaries = byExecutor.values().next().value
            if (!summaries) continue
            const allocation = allocationFor(summaries, ordered)
            if (!allocation) continue
            for (const [segment, count] of allocation) segment.remaining -= count
            const executor = summaries[0].executor
            for (const event of ordered) event.executor = executor
        }
    }

    function quarantineEligibleCapacity(state, events) {
        const signatures = new Map()
        for (const event of events) {
            if (event.executor) continue
            const key = `${event.authorId}\0${event.channelId}`
            signatures.set(key, [...(signatures.get(key) ?? []), event])
        }
        for (const eventsForSignature of signatures.values()) {
            for (const summary of state.summaries.values()) {
                if (!sameId(summary.targetId, eventsForSignature[0].authorId)
                    || !sameId(summary.channelId, eventsForSignature[0].channelId)) continue
                for (const segment of summary.segments) {
                    if (eventsForSignature.some((event) => Math.abs(segment.observedAt - event.createdAt) <= AUDIT_ENTRY_MAX_AGE_MS)) segment.remaining = 0
                }
            }
        }
        pruneState(state, now())
    }

    async function attemptSingleDelivery(errors, record, deletedBy) {
        try {
            for (const embed of makeNormalDeletionEmbeds({ buildCopyableMessageEmbeds, message: record.message, deletedBy })) {
                await botLog(record.message.guild, embed, 1, 'messages')
            }
        } catch (error) {
            errors.push(error)
        }
    }

    async function reconcileSingleQueue(state, queue) {
        reconcileEvents(state)
        const fetchErrors = []
        let fetchedAuditRecords = false
        let unresolved = queue.events.filter((event) => !event.executor)
        for (const delay of [0, ...reconciliationDelays]) {
            if (!unresolved.length) break
            if (delay) {
                await wait(delay)
                reconcileEvents(state)
                unresolved = queue.events.filter((event) => !event.executor)
                if (!unresolved.length) break
            }
            try {
                await fetchEntries(queue.guild, state, 72)
                fetchedAuditRecords = true
                reconcileEvents(state)
                unresolved = queue.events.filter((event) => !event.executor)
            } catch (error) {
                fetchErrors.push(error)
                for (const event of state.events) if (!event.executor) event.fetchFailed = true
            }
        }
        if (fetchErrors.length && !fetchedAuditRecords) console.error(
            'Message deletion audit reconciliation failed after bounded retries:', fetchErrors.at(-1),
        )
        quarantineEligibleCapacity(state, queue.events)
        try {
            const deliveryErrors = []
            for (const event of queue.events) {
                const deletedBy = event.executor ?? (!event.fetchFailed && !event.matchingEvidence && !event.executorAmbiguity
                    ? SELF_DELETE : 'unavailable')
                await attemptSingleDelivery(deliveryErrors, event, deletedBy)
            }
            if (deliveryErrors.length) throw new AggregateError(deliveryErrors, 'Message deletion BotLog delivery failed.')
        } finally {
            const delivered = new Set(queue.events)
            state.events = state.events.filter((event) => !delivered.has(event))
            for (const event of queue.events) event.resolve()
        }
    }

    async function deliverUnavailableMessage(message) {
        try {
            const errors = []
            await attemptSingleDelivery(errors, { message }, 'unavailable')
            if (errors.length) throw new AggregateError(errors, 'Message deletion BotLog delivery failed.')
        } catch (error) {
            console.error('Message deletion logging failed:', error)
        }
    }

    function recordSingleDeletion(message) {
        const guild = message?.guild
        if (!guild?.id) return Promise.resolve()
        if (!message?.author?.id || !messageChannelId(message)) {
            return deliverUnavailableMessage(message)
        }
        const state = stateForGuild(guild.id)
        let queue = state.queue
        if (!queue) {
            queue = { guild, events: [], readyAt: now() + batchDelay }
            state.queue = queue
            startSingleWorker(guild.id, state)
        }
        return new Promise((resolve) => {
            const event = {
                message, resolve, authorId: message.author.id, channelId: messageChannelId(message),
                order: ++state.order, createdAt: now(), executor: null,
                matchingEvidence: false, executorAmbiguity: false, fetchFailed: false,
            }
            state.events.push(event)
            queue.events.push(event)
        })
    }

    function startSingleWorker(guildId, state) {
        if (state.worker) return
        const queue = state.queue
        if (!queue) return
        let collectionFinished = false
        const worker = (async () => {
            await wait(Math.max(0, queue.readyAt - now()))
            collectionFinished = true
            if (state.queue === queue) state.queue = null
            await reconcileSingleQueue(state, queue)
        })()
        worker.catch((error) => console.error('Message deletion logging failed:', error)).finally(() => {
            state.worker = null
            if (collectionFinished && state.queue) startSingleWorker(guildId, state)
        })
        state.worker = worker
    }

    function resolveBulk(state, channelId, count) {
        const candidates = channelId ? [...state.records.values()].filter((record) => (
            isRecent(record.entry, now()) && record.entry?.executor?.id
            && sameId(bulkAuditChannelId(record.entry), channelId)
            && record.count === count
            && !record.bulkConsumed
        )) : []
        if (new Set(candidates.map((record) => record.entry.executor.id)).size !== 1) return null
        const candidate = candidates.sort((left, right) => entryTimestamp(right.entry) - entryTimestamp(left.entry))[0]
        candidate.bulkConsumed = true
        candidate.expiresAt = now() + AUDIT_BUFFER_TTL_MS
        pruneState(state, now())
        scheduleCleanup()
        return candidate.entry.executor
    }

    async function recordBulkDeletion(messages, channel) {
        const records = collectionValues(messages)
        if (!records.length) return
        const guild = channel?.guild ?? records[0]?.guild
        if (!guild?.id) return
        const channelId = channel?.id ?? messageChannelId(records[0])
        const state = stateForGuild(guild.id)
        await wait(batchDelay)
        let executor = resolveBulk(state, channelId, records.length)
        if (!executor) {
            try {
                await fetchEntries(guild, state, 73)
                executor = resolveBulk(state, channelId, records.length)
            } catch (error) {
                console.error('Bulk message deletion audit reconciliation failed:', error)
            }
        }
        const recovered = records.filter((message) => Boolean(message?.author?.id) && !message?.partial)
        const authors = new Map()
        for (const message of sortMessages(recovered)) authors.set(message.author.id, (authors.get(message.author.id) ?? 0) + 1)
        const authorText = authors.size
            ? [...authors.entries()].map(([id, count]) => `<@${id}> (${count})`).join(', ')
            : 'record unavailable'
        const description = [
            `Deleted by: ${executor?.id ? `<@${executor.id}>` : 'record unavailable'}`,
            `Messages deleted: ${records.length}`,
            `Message records recovered: ${recovered.length}`,
            `Records unavailable: ${records.length - recovered.length}`,
            '', `Message Authors: ${authorText}`, '',
            `Channel: ${channelId ? `<#${channelId}>` : 'record unavailable'}`,
        ].join('\n')
        await botLog(guild, new discord.EmbedBuilder()
            .setTitle('Messages Bulk Deleted 🗑️')
            .setDescription(description), 1, 'messages', {
            files: [{ attachment: Buffer.from(buildBulkCsv(records), 'utf8'), name: 'bulk-deleted-messages.csv' }],
        })
    }

    function recordAuditEntry(entry, guild) {
        const type = Number(entry?.action ?? entry?.actionType)
        if ((type !== 72 && type !== 73) || !guild?.id) return
        mergeEntries(stateForGuild(guild.id), type, [entry])
    }

    return { recordAuditEntry, recordSingleDeletion, recordBulkDeletion, sweepExpiredState }
}

module.exports = { createMessageDeletionLogger, buildBulkCsv, csvEscape }
