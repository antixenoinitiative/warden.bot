const Discord = require('discord.js');
const { botLog } = require('../../../functions');

let verificationHandlers;

function getVerificationHandlers() {
    if (!verificationHandlers) {
        verificationHandlers = require('../admin/verification');
    }

    return verificationHandlers;
}

function getVerificationRoute(interaction) {
    const customId = interaction.customId;

    if (interaction.isButton() && customId === 'wardenVerify-start') {
        return {
            handlerName: 'handleVerifyStart',
            errorTitle: '⛔ Verification start error',
            userError: 'Verification could not be started. Please contact staff.',
        };
    }

    if (interaction.isButton() && customId === 'wardenVerify-help') {
        return {
            handlerName: 'handleVerifyHelp',
            errorTitle: '⛔ Verification help error',
            userError: 'Verification help could not be shown. Please contact staff.',
        };
    }

    if (interaction.isButton() && customId.startsWith('wardenVerify-answer-')) {
        return {
            handlerName: 'handleVerifyAnswer',
            errorTitle: '⛔ Verification answer modal error',
            userError: 'Verification answer modal could not be opened. Please contact staff.',
        };
    }

    if (interaction.isButton() && customId.startsWith('wardenVerify-oldVersion-')) {
        return {
            handlerName: 'handleVerifyOldVersion',
            errorTitle: '⛔ Verification old version error',
            userError: 'Verification old version could not be shown. Please contact staff.',
        };
    }

    if (interaction.isModalSubmit() && customId.startsWith('wardenVerify-submit-')) {
        return {
            handlerName: 'handleVerifySubmit',
            errorTitle: '⛔ Verification submission error',
            userError: 'Verification could not be submitted. Please contact staff.',
        };
    }

    return null;
}

async function sendVerificationErrorResponse(interaction, content) {
    if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content });
        return;
    }

    if (interaction.replied) {
        await interaction.followUp({ content, flags: Discord.MessageFlags.Ephemeral });
        return;
    }

    await interaction.reply({ content, flags: Discord.MessageFlags.Ephemeral });
}

async function logVerificationError(interaction, err, title) {
    console.log(err);
    await botLog(interaction.guild, new Discord.EmbedBuilder()
        .setDescription('```' + err.stack + '```')
        .setTitle(title)
        ,2
        ,'error'
    );
}

async function handleVerificationInteraction(interaction) {
    const route = getVerificationRoute(interaction);

    if (!route) return false;

    try {
        const handlers = getVerificationHandlers();
        await handlers[route.handlerName](interaction);
    }
    catch (err) {
        try {
            await sendVerificationErrorResponse(interaction, route.userError);
        }
        catch (responseErr) {
            console.error('Failed to send verification error response:', responseErr);
        }

        try {
            await logVerificationError(interaction, err, route.errorTitle);
        }
        catch (logErr) {
            console.error('Failed to log verification interaction error:', logErr);
        }
    }

    return true;
}

module.exports = {
    handleVerificationInteraction,
};
