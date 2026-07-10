const Discord = require('discord.js');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const { getVerificationSettings } = require('./verificationSettings');
const { buildVerificationAutoKickEmbed } = require('./verificationResponses');

const AUTOKICK_DM_TO_KICK_DELAY_MS = 1000;
const activeAutokickTimers = new Map();

function getTimerKey(member) {
    return `${member.guild.id}:${member.id}`;
}

function clearAutokickTimer(member) {
    const timerKey = getTimerKey(member);
    const activeTimer = activeAutokickTimers.get(timerKey);

    if (activeTimer) {
        clearTimeout(activeTimer);
        activeAutokickTimers.delete(timerKey);
    }
}

async function processAutokick(member) {
    clearAutokickTimer(member);

    const verificationConfig = config.Warden?.verification ?? {};
    const unverifiedRoleId = verificationConfig.unverifiedRoleId;
    if (!unverifiedRoleId) return;

    const guild = member.guild;
    const freshMember = await guild.members.fetch(member.id).catch(() => null);
    if (!freshMember || !freshMember.roles.cache.has(unverifiedRoleId)) return;

    const verificationSettings = await getVerificationSettings(guild.id);
    const autoKickEmbed = buildVerificationAutoKickEmbed(freshMember, {
        autokickSeconds: verificationSettings.autokickSeconds,
    });
    await freshMember.send({ embeds: [autoKickEmbed] });

    setTimeout(async () => {
        try {
            await freshMember.kick('Verification autokick: user still had the unverified role after the configured timer.');
            await botLog(guild, new Discord.EmbedBuilder()
                .setTitle('Verification Autokick')
                .setDescription(`User ${freshMember.user.tag}(${freshMember.displayName}) was autokicked after not completing verification.`)
                .addFields(
                    { name: 'ID', value: `${freshMember.id}` },
                )
                , 1, 'info');
        }
        catch (err) {
            console.error('Failed to kick verification autokick candidate:', err);
            await botLog(guild, new Discord.EmbedBuilder()
                .setTitle('⛔ Verification autokick failed')
                .setDescription('```' + err.stack + '```')
                , 2, 'error');
        }
    }, AUTOKICK_DM_TO_KICK_DELAY_MS);
}

async function scheduleVerificationAutokick(member) {
    if (!member?.guild || member.user?.bot) return;

    const verificationSettings = await getVerificationSettings(member.guild.id);
    if (!verificationSettings.autokickEnabled) return;

    const unverifiedRoleId = config.Warden?.verification?.unverifiedRoleId;
    if (!unverifiedRoleId) return;

    clearAutokickTimer(member);
    const timer = setTimeout(() => {
        processAutokick(member).catch(async (err) => {
            clearAutokickTimer(member);
            console.error('Failed to process verification autokick:', err);
            try {
                await botLog(member.guild, new Discord.EmbedBuilder()
                    .setTitle('⛔ Verification autokick failed')
                    .setDescription('```' + err.stack + '```')
                    , 2, 'error');
            }
            catch (logErr) {
                console.error('Failed to log verification autokick error:', logErr);
            }
        });
    }, verificationSettings.autokickSeconds * 1000);

    activeAutokickTimers.set(getTimerKey(member), timer);
}

module.exports = {
    scheduleVerificationAutokick,
    clearAutokickTimer,
};
