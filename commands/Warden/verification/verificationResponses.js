const Discord = require('discord.js');
const { botIdent } = require('../../../functions');
const verificationEmbedConfig = require('./verificationEmbedConfig.json');
const {
    screenRequiresAnswer,
    getScreenRequiredAnswerQuestions,
    screenAllowsBack,
} = require('./verificationChallenges');
const {
    getQuestionAssetFiles,
    getQuestionDisplayItems,
} = require('./verificationImages');

const DESCRIPTION_LIMIT = 4096;
const FIELD_NAME_LIMIT = 256;
const FIELD_VALUE_LIMIT = 1024;
const MAX_FIELDS = 25;
const COMPONENTS_V2_RENDERER = 'components-v2';
const LEGACY_RENDERER = 'legacy';

function resolveColorAlias(color) {
    if (typeof color !== 'string') {
        return color;
    }

    return verificationEmbedConfig.responseDefaults?.colors?.[color] ?? color;
}

function resolveEmbedColor(color, fallbackColor = '#3498DB') {
    const resolvedFallback = resolveColorAlias(fallbackColor) ?? '#3498DB';
    const resolvedColor = resolveColorAlias(color) ?? resolvedFallback;

    if (typeof resolvedColor === 'string' && /^#[0-9a-fA-F]{3}$/.test(resolvedColor)) {
        return `#${resolvedColor.slice(1).split('').map((char) => char + char).join('')}`;
    }

    return resolvedColor;
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


function formatDuration(seconds) {
    if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
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


function buildVerificationAutoKickEmbed(member, options = {}) {
    const autokickSeconds = options.autokickSeconds;
    const timer = Number.isFinite(autokickSeconds) ? formatDuration(autokickSeconds) : '';

    return buildVerificationPublicEmbed('autoKickEmbed', {
        serverName: member.guild?.name ?? 'the server',
        user: member.user?.toString?.() ?? member.displayName ?? 'there',
        autokickTimer: timer,
    }, options);
}

// -----------------------------------------------------------------------------
// Challenge response builders
// -----------------------------------------------------------------------------

function isComponentsV2Available() {
    return Boolean(
        Discord.ContainerBuilder
        && Discord.TextDisplayBuilder
        && Discord.MediaGalleryBuilder
        && Discord.MediaGalleryItemBuilder
        && Discord.MessageFlags?.IsComponentsV2,
    );
}

function assertComponentsV2Support() {
    if (!isComponentsV2Available()) {
        throw new Error('Discord Components V2 builders are not available in this discord.js version.');
    }
}

function buildChallengeComponentCustomId(prefix, challengeId, screenIndex = 0, token) {
    return `${prefix}${challengeId}-${screenIndex}${token ? `-${token}` : ''}`;
}

function parseChallengeComponentCustomId(customId, prefix) {
    if (!customId.startsWith(prefix)) return undefined;

    const payload = customId.slice(prefix.length);
    const tokenSeparatorIndex = payload.lastIndexOf('-');
    if (tokenSeparatorIndex < 1) return undefined;

    const token = payload.slice(tokenSeparatorIndex + 1);
    const challengeAndScreen = payload.slice(0, tokenSeparatorIndex);
    const screenSeparatorIndex = challengeAndScreen.lastIndexOf('-');
    if (screenSeparatorIndex < 1) return undefined;

    const challengeId = challengeAndScreen.slice(0, screenSeparatorIndex);
    const screenIndex = Number(challengeAndScreen.slice(screenSeparatorIndex + 1));
    if (!challengeId || !Number.isInteger(screenIndex) || screenIndex < 0 || !token) return undefined;

    return { challengeId, screenIndex, token };
}

function parseAnswerCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-answer-');
}

function parseNextCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-next-');
}

function parseBackCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-back-');
}

function parseOldVersionCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-oldVersion-');
}

function parseSubmitCustomId(customId) {
    return parseChallengeComponentCustomId(customId, 'wardenVerify-submit-');
}

function getCurrentScreen(session) {
    return session.screens[session.screenIndex];
}

function hasNextScreen(session) {
    return session.screenIndex + 1 < session.screens.length;
}

function canGoBack(session) {
    return screenAllowsBack(session, session.screenIndex - 1);
}


function buildChallengeEmbedReplacements(challenge) {
    return {
        challenge: challenge?.description ?? challenge?.title ?? challenge?.id ?? '',
        challengeId: challenge?.id ?? '',
        challengeTitle: challenge?.title ?? '',
        challengeDescription: challenge?.description ?? '',
    };
}

function resolveChallengeEmbedTitle(challenge) {
    const configuredTitle = verificationEmbedConfig.challengeEmbed?.title ?? 'Verification Challenge';
    const challengeTitle = String(challenge?.title ?? '').trim();
    return challengeTitle && challengeTitle !== 'Verification Challenge' ? challengeTitle : configuredTitle;
}

function resolveChallengeEmbedDescription(challenge) {
    const configuredDescription = verificationEmbedConfig.challengeEmbed?.description;
    if (configuredDescription) {
        return applyTextReplacements(configuredDescription, buildChallengeEmbedReplacements(challenge));
    }

    return challenge?.description ?? 'Complete the verification questions to continue.';
}

function resolveChallengeEmbedColor(challenge) {
    return challenge?.color ?? verificationEmbedConfig.challengeEmbed?.color ?? verificationEmbedConfig.responseDefaults?.colors?.info;
}

function buildExpiryLine(expiresAt) {
    if (!expiresAt) return undefined;
    return `This verification challenge expires <t:${Math.floor(expiresAt / 1000)}:R>.`;
}

function truncateEmbedText(value, fallback = 'Not set') {
    const text = String(value ?? '').trim() || fallback;
    return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 3)}...` : text;
}

function applyQuestionFields(embed, question) {
    if (question.text) {
        embed.addFields({ name: question.label ?? question.id, value: truncateEmbedText(question.text), inline: false });
    }
}

function buildOldVersionActionRows(session) {
    return [
        new Discord.ActionRowBuilder().addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(buildChallengeComponentCustomId('wardenVerify-oldVersion-', session.challengeId, session.screenIndex, session.token))
                .setLabel(verificationEmbedConfig.oldVersionFallbackEmbed?.buttonLabel ?? 'Old Version')
                .setStyle(Discord.ButtonStyle.Secondary),
        ),
    ];
}

function buildScreenActionRows(session) {
    const screen = getCurrentScreen(session);
    const row = new Discord.ActionRowBuilder();

    if (canGoBack(session)) {
        row.addComponents(new Discord.ButtonBuilder()
            .setCustomId(buildChallengeComponentCustomId('wardenVerify-back-', session.challengeId, session.screenIndex, session.token))
            .setLabel('Back')
            .setStyle(Discord.ButtonStyle.Secondary));
    }

    if (screenRequiresAnswer(screen)) {
        row.addComponents(new Discord.ButtonBuilder()
            .setCustomId(buildChallengeComponentCustomId('wardenVerify-answer-', session.challengeId, session.screenIndex, session.token))
            .setLabel('Give Answer')
            .setStyle(Discord.ButtonStyle.Primary));
    }
    else {
        row.addComponents(new Discord.ButtonBuilder()
            .setCustomId(buildChallengeComponentCustomId('wardenVerify-next-', session.challengeId, session.screenIndex, session.token))
            .setLabel(hasNextScreen(session) ? 'Next' : 'Complete')
            .setStyle(Discord.ButtonStyle.Primary));
    }

    return row.components.length > 0 ? [row] : [];
}

function getScreenFiles(screenAssets = {}) {
    return Object.values(screenAssets).flatMap(getQuestionAssetFiles);
}

function getAssetDisplayItems(asset) {
    return getQuestionDisplayItems(asset).filter((item) => item.type === 'image' && item.displayUrl);
}

function addTextDisplay(container, content) {
    const text = String(content ?? '').trim();
    if (!text) return;
    container.addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(text.slice(0, 4000)));
}

function addAssetMediaGallery(container, asset) {
    const displayItems = getAssetDisplayItems(asset);
    if (displayItems.length < 1) return;

    const gallery = new Discord.MediaGalleryBuilder();
    for (const item of displayItems.slice(0, 10)) {
        const galleryItem = new Discord.MediaGalleryItemBuilder()
            .setURL(item.displayUrl);
        if (item.description) galleryItem.setDescription(item.description.slice(0, 256));
        gallery.addItems(galleryItem);
    }
    container.addMediaGalleryComponents(gallery);
}

function getFileName(file) {
    return file?.name ?? file?.attachment?.name ?? file?.data?.name;
}

function getEmbedImageUrl(embed) {
    return embed?.data?.image?.url;
}

function getFilesForEmbeds(files, embeds) {
    const attachmentNames = new Set(embeds
        .map(getEmbedImageUrl)
        .filter((url) => typeof url === 'string' && url.startsWith('attachment://'))
        .map((url) => url.slice('attachment://'.length)));

    if (attachmentNames.size < 1) return [];

    const matchedFiles = files.filter((file) => attachmentNames.has(getFileName(file)));
    return matchedFiles.length > 0 ? matchedFiles : files;
}

function buildQuestionScreenComponentsV2(challenge, screen, screenAssets = {}, session, options = {}) {
    assertComponentsV2Support();

    const container = new Discord.ContainerBuilder()
        .setAccentColor(resolveComponentAccentColor(resolveChallengeEmbedColor(challenge)));

    if (options.includeIntro) {
        addTextDisplay(container, `# ${resolveChallengeEmbedTitle(challenge)}`);
        addTextDisplay(container, resolveChallengeEmbedDescription(challenge));
        for (const field of challenge.fields ?? []) {
            const value = field.content ?? field.value ?? field.description;
            if (value) addTextDisplay(container, `**${field.title ?? field.name ?? 'Information'}**\n${value}`);
        }
    }

    if ((session?.screens?.length ?? 0) > 1 && options.showScreenProgress !== false) {
        addTextDisplay(container, `**Screen ${screen.index + 1} of ${session.screens.length}**`);
    }

    for (const question of screen.questions ?? []) {
        addTextDisplay(container, `## ${question.label ?? question.id}`);
        addTextDisplay(container, question.text);
        addAssetMediaGallery(container, screenAssets[question.id]);

        if (screenAssets[question.id]?.galleryState?.selectedImages?.length) {
            addTextDisplay(container, 'Use the displayed image positions when answering gallery questions.');
        }
    }

    addTextDisplay(container, buildExpiryLine(session?.expiresAt));
    if (!options.completed) {
        container.addActionRowComponents(...buildScreenActionRows(session));
    }

    return [container];
}

function getOldVersionFallbackEmbedConfig(challenge) {
    const fallbackConfig = verificationEmbedConfig.oldVersionFallbackEmbed ?? {};
    return {
        title: applyTextReplacements(fallbackConfig.title ?? 'Not working?', buildChallengeEmbedReplacements(challenge)),
        description: applyTextReplacements(
            fallbackConfig.description ?? 'If you cannot see the Verification Challenge, please update your client or click the Old Version button below.',
            buildChallengeEmbedReplacements(challenge),
        ),
        color: fallbackConfig.color ?? verificationEmbedConfig.challengeEmbed?.color,
    };
}

function addOldVersionFallbackField(embed, challenge, session) {
    const fallbackConfig = getOldVersionFallbackEmbedConfig(challenge);
    const value = [fallbackConfig.description, buildExpiryLine(session?.expiresAt)].filter(Boolean).join('\n\n');
    embed.addFields({
        name: truncateText(fallbackConfig.title, FIELD_NAME_LIMIT) || 'Not working?',
        value: truncateText(value, FIELD_VALUE_LIMIT) || 'Use the Old Version button below.',
        inline: false,
    });
}

function buildQuestionScreenLegacyPages(challenge, screen, screenAssets = {}, session, options = {}) {
    const allFiles = getScreenFiles(screenAssets);
    const allEmbeds = [];

    if (options.includeIntro) {
        const introEmbed = new Discord.EmbedBuilder()
            .setColor(resolveEmbedColor(resolveChallengeEmbedColor(challenge)))
            .setTitle(resolveChallengeEmbedTitle(challenge))
            .setDescription(truncateEmbedText([resolveChallengeEmbedDescription(challenge), buildExpiryLine(session.expiresAt)].filter(Boolean).join('\n\n'), 'Complete the verification questions to continue.'));

        for (const field of challenge.fields ?? []) {
            const value = field.content ?? field.value ?? field.description;
            if (value) introEmbed.addFields({ name: field.title ?? field.name ?? 'Information', value: truncateEmbedText(value, 'Information'), inline: field.inline === true });
        }

        if (options.includeOldVersionFallbackField) {
            addOldVersionFallbackField(introEmbed, challenge, session);
        }

        allEmbeds.push(introEmbed);
    }

    for (const question of screen.questions ?? []) {
        const asset = screenAssets[question.id];
        const displayItems = getAssetDisplayItems(asset);
        const isGallery = Boolean(asset?.galleryState);
        const description = [
            question.text,
            isGallery ? 'Use the displayed image positions when answering gallery questions.' : undefined,
            (session?.screens?.length ?? 0) > 1 ? `Screen ${screen.index + 1} of ${session.screens.length}` : undefined,
            buildExpiryLine(session.expiresAt),
        ].filter(Boolean).join('\n\n');
        const questionEmbed = new Discord.EmbedBuilder()
            .setTitle(question.label ?? question.id)
            .setDescription(truncateEmbedText(description, 'Review this question.'));

        if (displayItems.length > 0 && (!isGallery || asset.galleryState?.compositeImage)) {
            questionEmbed.setImage(displayItems[0].displayUrl);
        }

        allEmbeds.push(questionEmbed);

        if (isGallery && !asset.galleryState?.compositeImage) {
            for (const item of displayItems) {
                allEmbeds.push(new Discord.EmbedBuilder()
                    .setTitle(item.description ?? 'Verification image')
                    .setImage(item.displayUrl));
            }
        }
    }

    const pages = [];
    for (let index = 0; index < allEmbeds.length; index += 10) {
        const embeds = allEmbeds.slice(index, index + 10);
        pages.push({
            embeds,
            files: getFilesForEmbeds(allFiles, embeds),
            components: pages.length === 0 && !options.completed ? buildScreenActionRows({ ...session, renderer: LEGACY_RENDERER }) : [],
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    return pages.length > 0 ? pages : [{
        embeds: [new Discord.EmbedBuilder().setColor(resolveEmbedColor(resolveChallengeEmbedColor(challenge))).setTitle(resolveChallengeEmbedTitle(challenge)).setDescription([resolveChallengeEmbedDescription(challenge), buildExpiryLine(session.expiresAt)].filter(Boolean).join('\n\n') || 'Complete the verification questions to continue.')],
        files: [],
        components: !options.completed ? buildScreenActionRows({ ...session, renderer: LEGACY_RENDERER }) : [],
        flags: Discord.MessageFlags.Ephemeral,
    }];
}

function buildQuestionScreenLegacyOptions(challenge, screen, screenAssets = {}, session, options = {}) {
    return buildQuestionScreenLegacyPages(challenge, screen, screenAssets, session, options)[0];
}

function buildQuestionScreenOptions(challenge, screen, screenAssets = {}, session, options = {}) {
    const renderer = options.renderer ?? session?.renderer ?? COMPONENTS_V2_RENDERER;
    if (renderer === LEGACY_RENDERER) {
        return buildQuestionScreenLegacyOptions(challenge, screen, screenAssets, session, options);
    }

    assertComponentsV2Support();

    return {
        components: buildQuestionScreenComponentsV2(challenge, screen, screenAssets, session, options),
        files: getScreenFiles(screenAssets),
        flags: Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
    };
}

function buildChallengeIntroOptions(challenge, session, options = {}) {
    const introScreen = { id: 'intro', index: 0, questions: [], answerRequired: false };
    const renderer = options.renderer ?? COMPONENTS_V2_RENDERER;
    const introOptions = buildQuestionScreenOptions(challenge, introScreen, {}, session, {
        ...options,
        renderer,
        includeIntro: true,
        completed: true,
        showScreenProgress: false,
    });

    if (options.includeOldVersionButton) {
        introOptions.components = buildOldVersionActionRows(session);
    }

    return introOptions;
}

function buildOldVersionFallbackOptions(challenge, session) {
    const fallbackConfig = getOldVersionFallbackEmbedConfig(challenge);
    return {
        embeds: [
            new Discord.EmbedBuilder()
                .setColor(resolveEmbedColor(fallbackConfig.color))
                .setTitle(fallbackConfig.title)
                .setDescription([
                    fallbackConfig.description,
                    buildExpiryLine(session.expiresAt),
                ].filter(Boolean).join('\n\n')),
        ],
        components: buildOldVersionActionRows(session),
        flags: Discord.MessageFlags.Ephemeral,
    };
}

function buildAnswerModal(session) {
    const screen = getCurrentScreen(session);
    const requiredAnswerQuestions = getScreenRequiredAnswerQuestions(screen);
    if (requiredAnswerQuestions.length > 5) {
        throw new Error('This verification screen has too many answer inputs. Mark some questions separateStep:true.');
    }

    const modal = new Discord.ModalBuilder()
        .setCustomId(buildChallengeComponentCustomId('wardenVerify-submit-', session.challengeId, session.screenIndex, session.token))
        .setTitle('Verify');

    for (const question of requiredAnswerQuestions) {
        const answer = question.answer ?? {};

        const input = new Discord.TextInputBuilder()
            .setCustomId(`q:${question.id}:${answer.type === 'positions' ? 'positions' : 'answer'}`)
            .setLabel(answer.inputLabel ?? (answer.type === 'positions' ? 'Image position(s)' : 'Verification answer'))
            .setPlaceholder(answer.inputPlaceholder ?? (answer.type === 'positions' ? 'If multiple, separate position numbers by commas or spaces' : 'Enter your answer here'))
            .setStyle(Discord.TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new Discord.ActionRowBuilder().addComponents(input));
    }

    return modal;
}

function buildCompletedQuestionOptions(message = 'Verification step completed.', options = {}) {
    const renderer = options.renderer ?? COMPONENTS_V2_RENDERER;

    if (renderer === COMPONENTS_V2_RENDERER && isComponentsV2Available()) {
        const container = new Discord.ContainerBuilder()
            .setAccentColor(resolveComponentAccentColor(verificationEmbedConfig.challengeEmbed?.color));

        addTextDisplay(container, `# Verification\n${message}`);

        return {
            components: [container],
            files: [],
            attachments: [],
            flags: Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
        };
    }

    return {
        embeds: [new Discord.EmbedBuilder().setTitle('Verification').setDescription(message)],
        components: [],
        files: [],
        attachments: [],
        flags: Discord.MessageFlags.Ephemeral,
    };
}


async function sendInitialInteractionResponse(interaction, options) {
    if (interaction.deferred) {
        return interaction.editReply(sanitizeMessageEditOptions(options));
    }

    if (interaction.replied) {
        return interaction.followUp(options);
    }

    return interaction.reply(options);
}

function sanitizeMessageEditOptions(options = {}) {
    const editOptions = { ...options };

    delete editOptions.ephemeral;

    if (typeof editOptions.flags === 'number') {
        editOptions.flags &= ~Discord.MessageFlags.Ephemeral;

        if (editOptions.flags === 0) {
            delete editOptions.flags;
        }
    }

    return editOptions;
}

module.exports = {
    COMPONENTS_V2_RENDERER,
    LEGACY_RENDERER,
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
    buildVerificationAutoKickEmbed,
    buildResultEmbed,
    isComponentsV2Available,
    assertComponentsV2Support,
    buildChallengeIntroOptions,
    buildQuestionScreenOptions,
    buildQuestionScreenComponentsV2,
    buildQuestionScreenLegacyOptions,
    buildQuestionScreenLegacyPages,
    buildOldVersionFallbackOptions,
    buildAnswerModal,
    buildScreenActionRows,
    buildChallengeComponentCustomId,
    parseChallengeComponentCustomId,
    parseAnswerCustomId,
    parseNextCustomId,
    parseBackCustomId,
    parseOldVersionCustomId,
    parseSubmitCustomId,
    buildCompletedQuestionOptions,
    sanitizeMessageEditOptions,
    sendInitialInteractionResponse,
};
