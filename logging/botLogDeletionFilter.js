function isBotLogDeletion(message, channel, { botName, channels } = {}) {
    const guild = message?.guild ?? channel?.guild
    const channelId = message?.channelId ?? message?.channel?.id ?? channel?.id
    const inLoggingChannel = channelId != null && ['general', 'error', 'staff', 'users', 'messages']
        .some(key => channels?.[key] != null && String(channels[key]) === String(channelId))
    const authorId = message?.author?.id
    if (!authorId) return inLoggingChannel

    const botId = message?.client?.user?.id ?? guild?.client?.user?.id ?? channel?.client?.user?.id
    if (!botId || String(authorId) !== String(botId)) return false
    if (inLoggingChannel) return true
    if (!botName) return false
    return Array.from(message?.embeds ?? []).some(embed => (
        String(embed?.footer?.text ?? '').trim().replace(/\s+/g, ' ') === `${botName} Logs`
    ))
}

module.exports = { isBotLogDeletion }
