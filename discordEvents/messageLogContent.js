const Discord = require('discord.js')

function attachments(message) {
    return Array.from(message?.attachments?.values?.() ?? [])
}

function messageText(message) {
    if (!message || typeof message.content !== 'string') return 'Record unavailable'
    return message.content || 'No text content'
}

function attachmentsChanged(oldMessage, newMessage) {
    const signature = message => attachments(message)
        .map(file => JSON.stringify([file.id, file.name, file.description ?? null]))
        .sort().join('\n')
    return signature(oldMessage) !== signature(newMessage)
}

function attachmentLinks(message) {
    return attachments(message).map(file => {
        const name = Discord.escapeMarkdown(String(file.name || 'Attachment')).slice(0, 300)
        const url = file.url ?? file.proxyURL
        const safeUrl = typeof url === 'string' && /^https?:\/\//i.test(url)
            ? url.replace(/[\s<>]/g, character => encodeURIComponent(character)) : null
        return safeUrl && safeUrl.length <= 3500 ? `[${name}](<${safeUrl}>)` : name
    })
}

module.exports = { messageText, attachmentsChanged, attachmentLinks }
