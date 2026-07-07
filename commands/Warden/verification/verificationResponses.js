const Discord = require('discord.js');
const { botIdent } = require('../../../functions');
const verificationEmbedConfig = require('./verificationEmbedConfig.json');

const DESCRIPTION_LIMIT = 4096;
const FIELD_NAME_LIMIT = 256;
const FIELD_VALUE_LIMIT = 1024;
const MAX_FIELDS = 25;

function resolveEmbedColor(color, fallbackColor = '#3498DB') {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{3}$/.test(color)) {
        return `#${color.slice(1).split('').map((char) => char + char).join('')}`;
    }

    return color ?? fallbackColor;
}

function resolveComponentAccentColor(color, fallbackColor = '#3498DB') {
    const resolvedColor = resolveEmbedColor(color, fallbackColor);

    if (typeof resolvedColor === 'number') {
        return resolvedColor;
    }

    if (typeof resolvedColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(resolvedColor)) {
        return Number.parseInt(resolvedColor.slice(1), 16);
    }

    return Number.parseInt(resolveEmbedColor(fallbackColor).slice(1), 16);
}

function applyTextReplacements(text, replacements = {}) {
    let resolvedText = String(text ?? '');

    for (const [key, value] of Object.entries(replacements)) {
        resolvedText = resolvedText.replaceAll(`{${key}}`, String(value ?? ''));
    }

    return resolvedText;
}

function truncateText(value, limit = DESCRIPTION_LIMIT) {
    const text = String(value ?? '');
    if (text.length <= limit) return text;

    return `${text.slice(0, Math.max(0, limit - 17))}\n... [truncated]`;
}

function resolveActiveBotIconURL() {
    try {
        return botIdent().activeBot?.icon;
    }
    catch (err) {
        return undefined;
    }
}

function resolveTemplate(templateKey) {
    return verificationEmbedConfig.adminResponseTemplates?.[templateKey]
        ?? verificationEmbedConfig.adminResponses?.[templateKey]
        ?? verificationEmbedConfig[templateKey]
        ?? verificationEmbedConfig.adminResponseTemplates?.genericError
        ?? verificationEmbedConfig.adminResponses?.genericError
        ?? {};
}

function resolveResponseColor(template, options = {}, replacements = {}) {
    const defaults = verificationEmbedConfig.responseDefaults ?? {};
    const colors = defaults.colors ?? {};
    const rawColor = options.color ?? template.color;
    const color = typeof rawColor === 'string' ? applyTextReplacements(rawColor, replacements) : rawColor;
    const fallback = colors.info ?? '#3498DB';

    if (colors[color]) {
        return resolveEmbedColor(colors[color], fallback);
    }

    const resolvedColor = resolveEmbedColor(color, fallback);
    if (typeof resolvedColor === 'number') {
        return resolvedColor;
    }

    if (typeof resolvedColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(resolvedColor)) {
        return resolvedColor;
    }

    return resolveEmbedColor(fallback);
}

function applyFieldToEmbed(embed, field, replacements = {}) {
    if (!field) return;

    if (field.imageUrl) {
        return;
    }

    const rawValue = field.content ?? field.value ?? field.description;
    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    const name = truncateText(applyTextReplacements(field.title ?? field.name ?? '\u200B', replacements), FIELD_NAME_LIMIT);
    const value = truncateText(applyTextReplacements(rawValue, replacements), FIELD_VALUE_LIMIT);
    if (!value) return;

    embed.addFields({
        name: name || '\u200B',
        value,
        inline: field.inline ?? false,
    });
}

function applyEmbedMeta(embed, template, replacements = {}, options = {}) {
    const defaults = verificationEmbedConfig.responseDefaults ?? {};
    const defaultFooter = defaults.footer ?? {};
    const footer = options.footer ?? template.footer;
    const shouldUseDefaultFooter = footer === undefined && defaultFooter.enabled;
    const shouldUseTemplateFooter = footer?.enabled !== false && footer?.text;

    if (shouldUseTemplateFooter || shouldUseDefaultFooter) {
        embed.setFooter({
            text: applyTextReplacements(footer?.text ?? defaultFooter.text ?? 'Warden Verification', replacements),
            iconURL: footer?.iconURL ?? defaultFooter.iconURL ?? resolveActiveBotIconURL(),
        });
    }

    if (options.timestamp ?? template.timestamp ?? defaults.timestamp) {
        embed.setTimestamp();
    }

    if (template.thumbnail?.enabled && template.thumbnail.url) {
        embed.setThumbnail(applyTextReplacements(template.thumbnail.url, replacements));
    }

    if (template.icon?.enabled && template.icon.url) {
        embed.setAuthor({
            name: applyTextReplacements(template.title ?? 'Warden Verification', replacements),
            iconURL: applyTextReplacements(template.icon.url, replacements),
        });
    }
}

function buildVerificationEmbed(templateKey, replacements = {}, options = {}) {
    const template = { ...resolveTemplate(templateKey), ...options.templateOverrides };
    const embed = new Discord.EmbedBuilder().setColor(resolveResponseColor(template, options, replacements));

    if (template.title) {
        embed.setTitle(truncateText(applyTextReplacements(template.title, replacements), 256));
    }

    if (template.description) {
        const description = truncateText(applyTextReplacements(template.description, replacements), DESCRIPTION_LIMIT);
        if (description) embed.setDescription(description);
    }

    const fields = [
        ...(template.fields ?? []),
        ...(options.fields ?? []),
    ];
    for (const field of fields.slice(0, MAX_FIELDS)) {
        applyFieldToEmbed(embed, field, replacements);
    }

    applyEmbedMeta(embed, template, replacements, options);

    return embed;
}

function buildVerificationResponse(templateKey, replacements = {}, options = {}) {
    const response = {
        embeds: [buildVerificationEmbed(templateKey, replacements, options)],
    };

    if (options.includeFlags !== false) {
        response.flags = options.flags ?? Discord.MessageFlags.Ephemeral;
    }

    return response;
}

function buildVerificationPublicEmbed(templateKey, replacements = {}, options = {}) {
    return buildVerificationEmbed(templateKey, replacements, {
        footer: { enabled: false },
        timestamp: false,
        ...options,
    });
}

function buildVerificationPublicResponse(templateKey, replacements = {}, options = {}) {
    const {
        flags = Discord.MessageFlags.Ephemeral,
        ...embedOptions
    } = options;

    return {
        embeds: [buildVerificationPublicEmbed(templateKey, replacements, embedOptions)],
        flags,
    };
}

function buildVerificationInProgressResponse(expiresAt, options = {}) {
    return buildVerificationPublicResponse('inProgressEmbed', {
        retryTime: `<t:${Math.floor(expiresAt / 1000)}:R>`,
    }, options);
}

function buildVerificationExpiredResponse(description, options = {}) {
    return buildVerificationPublicResponse('expiredChallengeEmbed', {}, {
        templateOverrides: description ? { description } : undefined,
        ...options,
    });
}

function buildVerificationFailureResponse(cooldownSeconds, retryAt, options = {}) {
    return buildVerificationPublicResponse('failureEmbed', {
        cooldownSeconds,
        retryTime: `<t:${Math.floor(retryAt / 1000)}:R>`,
    }, options);
}

// For editReply() after an already-ephemeral deferReply().
function buildVerificationAdminResponse(templateKey, replacements = {}, options = {}) {
    return buildVerificationResponse(templateKey, replacements, { includeFlags: false, ...options });
}

function buildVerificationAdminSettingUpdated(label, message, options = {}) {
    return buildVerificationAdminResponse('settingUpdated', { label, message }, options);
}

function buildVerificationAdminStatus(label, message, fields = [], options = {}) {
    return buildVerificationAdminResponse('settingStatus', { label, message }, { fields, ...options });
}

function buildVerificationAdminConfiguration(label, message, fields = [], options = {}) {
    return buildVerificationAdminResponse('configurationList', { label, message }, { fields, ...options });
}

function buildVerificationAdminActionCompleted(label, message, options = {}) {
    return buildVerificationAdminResponse('actionCompleted', { label, message }, options);
}

function buildVerificationAdminSummary(label, message, summary, tone = 'info', options = {}) {
    return buildVerificationAdminResponse(
        'summary',
        { label, message, summary, tone },
        { color: tone, ...options },
    );
}

function buildVerificationErrorEmbed(message, options = {}) {
    return buildVerificationEmbed('genericError', { message }, { color: 'error', ...options });
}

function buildVerificationErrorResponse(message, options = {}) {
    const response = { embeds: [buildVerificationErrorEmbed(message, options)] };
    if (options.includeFlags !== false) {
        response.flags = options.flags ?? Discord.MessageFlags.Ephemeral;
    }
    return response;
}

function buildVerificationSuccessResponse(templateKey, replacements = {}, options = {}) {
    return buildVerificationResponse(templateKey, replacements, { color: 'success', ...options });
}

function buildVerificationInfoResponse(templateKey, replacements = {}, options = {}) {
    return buildVerificationResponse(templateKey, replacements, { color: 'info', ...options });
}

function buildVerificationListResponse(templateKey, replacements = {}, fields = [], options = {}) {
    return buildVerificationResponse(templateKey, replacements, { fields, ...options });
}

function buildResultEmbed(embedConfig, fallbackTitle, fallbackDescription, replacements = {}) {
    const template = {
        title: embedConfig?.title ?? fallbackTitle,
        description: embedConfig?.description ?? fallbackDescription,
        color: embedConfig?.color,
        fields: embedConfig?.fields,
        thumbnail: embedConfig?.thumbnail,
        icon: embedConfig?.icon,
        footer: embedConfig?.footer,
        timestamp: embedConfig?.timestamp,
    };

    return buildVerificationEmbed('resultEmbed', replacements, {
        templateOverrides: template,
        footer: embedConfig?.footer ?? { enabled: false },
        timestamp: embedConfig?.timestamp ?? false,
    });
}

module.exports = {
    resolveEmbedColor,
    resolveComponentAccentColor,
    applyTextReplacements,
    applyFieldToEmbed,
    truncateText,
    buildVerificationEmbed,
    buildVerificationResponse,
    buildVerificationPublicEmbed,
    buildVerificationPublicResponse,
    buildVerificationInProgressResponse,
    buildVerificationExpiredResponse,
    buildVerificationFailureResponse,
    buildVerificationAdminResponse,
    buildVerificationAdminSettingUpdated,
    buildVerificationAdminStatus,
    buildVerificationAdminConfiguration,
    buildVerificationAdminActionCompleted,
    buildVerificationAdminSummary,
    buildVerificationErrorEmbed,
    buildVerificationErrorResponse,
    buildVerificationSuccessResponse,
    buildVerificationInfoResponse,
    buildVerificationListResponse,
    buildResultEmbed,
};
