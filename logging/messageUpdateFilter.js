const installedClients = new WeakSet()
const updateEvidence = new WeakMap()
const STALE_EDIT_AGE_MS = 24 * 60 * 60 * 1000

function installMessageUpdateEvidence(client) {
    if (installedClients.has(client)) return
    installedClients.add(client)
    const pending = new Map()

    client.on('raw', packet => {
        if (packet?.t !== 'MESSAGE_UPDATE') return
        const data = packet.d
        if (!data?.id || !data.channel_id) return
        const key = `${data.channel_id}:${data.id}`
        const evidence = {
            receivedAt: Date.now(),
            hasContent: Object.hasOwn(data, 'content'),
            hasAttachments: Object.hasOwn(data, 'attachments'),
            hasEmbeds: Object.hasOwn(data, 'embeds'),
            hasEditedTimestamp: Object.hasOwn(data, 'edited_timestamp'),
            editedTimestamp: data.edited_timestamp,
        }
        pending.set(key, evidence)
        queueMicrotask(() => {
            if (pending.get(key) === evidence) pending.delete(key)
        })
    })

    client.prependListener('messageUpdate', (oldMessage, newMessage) => {
        const key = `${newMessage.channelId}:${newMessage.id}`
        const evidence = pending.get(key)
        pending.delete(key)
        if (evidence) updateEvidence.set(oldMessage, evidence)
    })
}

function isBackgroundMessageUpdate(oldMessage, newMessage, attachmentChange) {
    const evidence = updateEvidence.get(oldMessage)
    if (!evidence) return false
    const knownOldContent = !oldMessage?.partial && typeof oldMessage?.content === 'string'
    if (knownOldContent && (
        (typeof newMessage?.content === 'string' && oldMessage.content !== newMessage.content)
        || attachmentChange
    )) return false

    if (evidence.hasEditedTimestamp) {
        if (evidence.editedTimestamp === null) return true
        const editedAt = typeof evidence.editedTimestamp === 'string'
            ? Date.parse(evidence.editedTimestamp) : NaN
        if (!Number.isFinite(editedAt)) return false
        return evidence.receivedAt - editedAt > STALE_EDIT_AGE_MS
    }

    return evidence.hasEmbeds && !evidence.hasContent && !evidence.hasAttachments
}

module.exports = { installMessageUpdateEvidence, isBackgroundMessageUpdate, STALE_EDIT_AGE_MS }
