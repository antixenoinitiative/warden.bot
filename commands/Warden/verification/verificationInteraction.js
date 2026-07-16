const Discord = require('discord.js');

const ACKNOWLEDGEMENT_MODES = Object.freeze({
    reply: 'reply',
    sourceUpdate: 'source-update',
});

function withoutEphemeralFlag(payload = {}) {
    const response = { ...payload };
    if (typeof response.flags === 'number') {
        response.flags &= ~Discord.MessageFlags.Ephemeral;
        if (response.flags === 0) delete response.flags;
    }
    return response;
}

function sanitizeMessageEditOptions(payload = {}) {
    const response = withoutEphemeralFlag(payload);
    delete response.ephemeral;
    return response;
}

function withEphemeralFlag(payload = {}) {
    return {
        ...payload,
        flags: Number(payload.flags ?? 0) | Discord.MessageFlags.Ephemeral,
    };
}

function isFromMessage(interaction) {
    return typeof interaction?.isFromMessage === 'function'
        ? interaction.isFromMessage()
        : Boolean(interaction?.message);
}

function markAcknowledgement(interaction, mode) {
    interaction.wardenVerificationAcknowledgementMode = mode;
    return { mode };
}

function getAcknowledgementMode(interaction, acknowledgement) {
    return acknowledgement?.mode ?? interaction?.wardenVerificationAcknowledgementMode;
}

function isSourceUpdateAcknowledgement(acknowledgement) {
    return acknowledgement?.mode === ACKNOWLEDGEMENT_MODES.sourceUpdate;
}

async function deferSourceUpdate(interaction) {
    await interaction.deferUpdate();
    return markAcknowledgement(interaction, ACKNOWLEDGEMENT_MODES.sourceUpdate);
}

async function deferEphemeralReply(interaction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    return markAcknowledgement(interaction, ACKNOWLEDGEMENT_MODES.reply);
}

async function acknowledgePanelSubmit(interaction) {
    if (typeof interaction.deferUpdate === 'function' && isFromMessage(interaction)) {
        return deferSourceUpdate(interaction);
    }

    return deferEphemeralReply(interaction);
}

async function sendEphemeralNotice(interaction, payload, options = {}) {
    const response = withEphemeralFlag(payload);
    const acknowledgementMode = getAcknowledgementMode(interaction, options.acknowledgement);
    const mustFollowUp = options.followUp === true
        || acknowledgementMode === ACKNOWLEDGEMENT_MODES.sourceUpdate
        || interaction.replied;

    if (mustFollowUp) return interaction.followUp(response);
    if (interaction.deferred) return interaction.editReply(sanitizeMessageEditOptions(response));
    return interaction.reply(response);
}

async function sendInitialInteractionResponse(interaction, payload) {
    if (interaction.deferred) return interaction.editReply(sanitizeMessageEditOptions(payload));
    if (interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
}

async function sendAcknowledgedNotice(interaction, acknowledgement, payload) {
    return sendEphemeralNotice(interaction, payload, { acknowledgement });
}

async function updateSourcePanel(interaction, panelPayload, {
    acknowledgement,
    sourceMessageId,
    successPayload,
    fallbackPayload,
    preferSourceUpdate = true,
} = {}) {
    const editablePanelPayload = sanitizeMessageEditOptions(panelPayload);
    if (isSourceUpdateAcknowledgement(acknowledgement)) {
        return interaction.editReply(editablePanelPayload);
    }

    let sourceUpdated = false;
    const handleEditError = (err) => {
        if (err?.code === 10008) {
            console.warn('[ADMIN UX] Source admin panel message was no longer editable; using fallback response.');
            return;
        }
        console.error('Failed to update admin panel message:', err);
    };

    if (preferSourceUpdate && interaction.message) {
        await interaction.message.edit(editablePanelPayload)
            .then(() => { sourceUpdated = true; })
            .catch(handleEditError);
    }
    else if (preferSourceUpdate && sourceMessageId && typeof interaction.webhook?.editMessage === 'function') {
        await interaction.webhook.editMessage(sourceMessageId, editablePanelPayload)
            .then(() => { sourceUpdated = true; })
            .catch(handleEditError);
    }

    if (sourceUpdated && successPayload) return interaction.editReply(sanitizeMessageEditOptions(successPayload));
    if (sourceUpdated) return undefined;
    if (fallbackPayload) return interaction.editReply(sanitizeMessageEditOptions(fallbackPayload));
    return interaction.editReply(editablePanelPayload);
}

module.exports = {
    acknowledgePanelSubmit,
    deferEphemeralReply,
    deferSourceUpdate,
    sanitizeMessageEditOptions,
    sendAcknowledgedNotice,
    sendEphemeralNotice,
    sendInitialInteractionResponse,
    updateSourcePanel,
};
