const Discord = require('discord.js');
const config = require('../../../config.json');
const { botLog } = require('../../../functions');
const verificationEmbedConfig = require('./verificationEmbedConfig.json');
const { getVerificationSettings } = require('./verificationSettings');

const AUTOKICK_DM_TO_KICK_DELAY_MS = 1000;
const activeAutokickTimers = new Map();

function resolveEmbedColor(color, fallbackColor = '#E74C3C') {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{3}$/.test(color)) {
        return `#${color.slice(1).split('').map((char) => char + char).join('')}`;
    }

    return color ?? fallbackColor;
}

function applyTemplate(template, values) {
    return String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function buildAutoKickEmbed(member) {
    const embedConfig = verificationEmbedConfig.autoKickEmbed ?? {};
    const values = {
        serverName: member.guild?.name ?? 'the server',
        user: member.user?.toString?.() ?? member.displayName ?? 'there',
    };

    return new Discord.EmbedBuilder()
        .setColor(resolveEmbedColor(embedConfig.color))
        .setTitle(applyTemplate(embedConfig.title ?? 'Verification Required', values))
        .setDescription(applyTemplate(embedConfig.description ?? 'You were removed from {serverName} because verification was not completed in time.', values));
}

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

    const autoKickEmbed = buildAutoKickEmbed(freshMember);
    await freshMember.send({ embeds: [autoKickEmbed] });

    setTimeout(async () => {
        try {
            await freshMember.kick('Verification autokick: user still had the unverified role after the configured timer.');
            await botLog(guild, new Discord.EmbedBuilder()
                .setTitle('Verification autokick')
                .setDescription(`Kicked ${freshMember.user.tag} (${freshMember.id}) after they did not complete verification.`)
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
    buildAutoKickEmbed,
};
