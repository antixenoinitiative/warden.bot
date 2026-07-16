const { handleVerificationInteraction: handleRuntimeInteraction } = require('./verificationFlow');
const { sendEphemeralNotice } = require('./verificationInteraction');

const ADMIN_CUSTOM_ID_PREFIX = 'wVA:';

function isAdminInteraction(interaction) {
    return String(interaction?.customId ?? '').startsWith(ADMIN_CUSTOM_ID_PREFIX);
}

function resolveAdminCommand(interaction, bot) {
    return interaction.client?.commands?.get('verification')
        ?? bot?.commands?.get('verification');
}

async function dispatchAdminInteraction(interaction, bot) {
    if (!isAdminInteraction(interaction)) return false;

    const command = resolveAdminCommand(interaction, bot);
    if (!command) throw new Error('Verification Admin command was not registered.');

    if (interaction.isModalSubmit?.()) {
        return Boolean(await command.handleModalSubmit?.(interaction));
    }

    if (interaction.isButton?.()) {
        const handler = command.handleButtonInteraction ?? command.handleComponentInteraction;
        return Boolean(await handler?.call(command, interaction));
    }

    if (interaction.isStringSelectMenu?.()) {
        const handler = command.handleComponentInteraction ?? command.handleButtonInteraction;
        return Boolean(await handler?.call(command, interaction));
    }

    return false;
}

async function handleInteraction(interaction, bot) {
    try {
        if (await handleRuntimeInteraction(interaction)) return true;
        if (!isAdminInteraction(interaction)) return false;
        return await dispatchAdminInteraction(interaction, bot);
    }
    catch (err) {
        console.error('Verification feature interaction failed:', err);
        await sendEphemeralNotice(interaction, {
            content: 'There was an error while handling this verification interaction.',
        }, {
            followUp: interaction.deferred || interaction.replied,
        }).catch((responseErr) => console.error('Failed to send verification feature error response:', responseErr));
        return true;
    }
}

module.exports = {
    handleInteraction,
    isAdminInteraction,
};
