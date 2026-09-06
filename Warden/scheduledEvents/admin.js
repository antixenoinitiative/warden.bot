'use strict';

const Discord = require('discord.js');
const { getIdentityBrandColor } = require('../../functions');
const { createUXPanelDocument } = require('../../ux/documents');
const { renderComponentsV2 } = require('../../ux/renderers/componentsV2');
const { createPanelSessionRegistry } = require('../../ux/interactions/sessions');
const { createPagination } = require('../../ux/interactions/pagination');
const { createInteractionRouter } = require('../../ux/interactions/router');
const {
    acknowledgePanelInteraction,
    completePanelInteraction,
    deferEphemeralReply,
    respondAfterAcknowledgement,
    sanitizeMessageEditOptions,
} = require('../../ux/interactions/acknowledgement');
const {
    buildModal,
    buildModalCheckboxField,
    buildModalTextDisplay,
    getModalCheckbox,
} = require('../../ux/components/modalFields');
const scheduledEvents = require('./index');

const PAGINATION_METADATA = 'scheduledEventAdminPagination';
const sessions = createPanelSessionRegistry({
    prefix: 'wE',
    label: 'Scheduled Event Publishing',
    maxEntries: 100,
});
const pagination = createPagination({
    action: 'page',
    buildStateCustomId: (action, parts, state) => state.pagination.panelSession.buildState(action, parts, state),
    parseCustomId: sessions.parse,
    metadataProperty: PAGINATION_METADATA,
    copy: {
        expired: 'This Scheduled Event Publishing panel has expired. Run `/event-settings` again.',
        wrongOwner: 'This panel belongs to another administrator.',
        wrongGuild: 'This panel belongs to another server.',
        unavailable: 'This Scheduled Event Publishing page is no longer available.',
    },
});

function errorEmbed(message) {
    return new Discord.EmbedBuilder()
        .setColor('#f55142')
        .setTitle('Scheduled Event Publishing')
        .setDescription(String(message || 'The Scheduled Event action failed.'));
}

function discordTimestamp(value, style = 'f') {
    const milliseconds = Number(value);
    return Number.isFinite(milliseconds) && milliseconds > 0
        ? `<t:${Math.floor(milliseconds / 1000)}:${style}>`
        : 'Not specified';
}

function publicationLabel(event) {
    if (event.publicationState === 'published') return 'Published and syncing';
    if (event.publicationState === 'delete_pending') return 'Website deletion pending';
    if (event.publicationState === 'deleted') return 'Not published';
    return 'Not published';
}

function eventLocation(event) {
    if (event.location) return event.location;
    if (event.channelId) return `<#${event.channelId}>`;
    return 'Not specified';
}

function eventButton(session, event) {
    if (event.publicationState === 'delete_pending') {
        return new Discord.ButtonBuilder()
            .setCustomId(session.build('pending', event.eventId))
            .setLabel('Deletion Pending')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(true);
    }
    const published = event.publicationState === 'published';
    return new Discord.ButtonBuilder()
        .setCustomId(session.build(published ? 'confirmDelete' : 'confirmPublish', event.eventId))
        .setLabel(published ? 'Delete Website Post' : 'Publish to Website')
        .setStyle(published ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Success);
}

function eventSection(session, event) {
    const interested = Number.isInteger(event.interestedCount) && event.interestedCount >= 0
        ? String(event.interestedCount)
        : 'Unavailable';
    return {
        kind: 'section',
        content: [
            `### ${event.name || 'Untitled Event'}\n`
            + `Status: **${event.status || 'Scheduled'}**\n`
            + `Starts: ${discordTimestamp(event.scheduledStartAtMs)}\n`
            + `Location: ${eventLocation(event)}\n`
            + `Interested: **${interested}**\n`
            + `Website: **${publicationLabel(event)}**`,
        ],
        accessory: eventButton(session, event),
    };
}

function buildPanel(events, guildId, ownerUserId) {
    const panelSession = sessions.create({ guildId, ownerUserId, state: { events } });
    const paginationSession = pagination.createSession({
        guildId,
        ownerUserId,
        key: `events:${guildId}`,
        panelSession,
    });
    try {
        const refreshRow = new Discord.ActionRowBuilder().addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(panelSession.build('refresh'))
                .setLabel('Refresh Events')
                .setStyle(Discord.ButtonStyle.Primary),
        );
        const document = createUXPanelDocument({
            title: 'Scheduled Event Publishing',
            description: 'Publish and synchronize Discord Scheduled Events with the AXI website.',
            accentColor: getIdentityBrandColor('Warden'),
            ephemeral: true,
            editorBlocks: [
                { kind: 'actions', rows: [refreshRow] },
                { kind: 'separator', divider: true, spacing: 'Large' },
                {
                    kind: 'text',
                    content: events.length > 0
                        ? '## Discord Events\nPublished events continue syncing when their Discord details or status change.'
                        : '## Discord Events\nNo current Discord Scheduled Events were found.',
                },
                ...events.map((event) => eventSection(panelSession, event)),
            ],
            pagination: { key: `events:${guildId}` },
        });
        const rendered = renderComponentsV2(document, {
            paginationRowFactory: ({ page, pageCount }) => pagination.buildRow(paginationSession, page, pageCount),
        });
        let payload = sanitizeMessageEditOptions(rendered.payload);
        if (rendered.pages.length > 1) {
            pagination.setPages(paginationSession, rendered.pages);
            payload = pagination.attachPages(payload, rendered.pages, `events:${guildId}`);
        }
        Object.defineProperty(payload, 'panelSession', { value: panelSession, enumerable: false });
        return payload;
    }
    catch (error) {
        panelSession.dispose();
        throw error;
    }
}

function eventFromState(state, eventId) {
    const event = state.events.find((candidate) => String(candidate.eventId) === String(eventId));
    if (!event) throw new Error('This event is no longer available. Refresh the panel and try again.');
    return event;
}

function showConfirmation(interaction, parts, state, action) {
    const event = eventFromState(state, parts[0]);
    const publishing = action === 'publish';
    const formId = state.panelSession.buildForm(
        publishing ? 'publish' : 'delete',
        [event.eventId],
        {},
        interaction.customId,
    );
    const explanation = publishing
        ? `Publish **${event.name}** to the website?\n\nThe post will automatically stay synchronized with edits and status changes made to the Discord event.`
        : `Delete the website post for **${event.name}**?\n\nThis moves the website post to the WordPress trash. It does not delete or cancel the Discord event.`;
    return interaction.showModal(buildModal(
        formId,
        publishing ? 'Publish Event' : 'Delete Website Post',
        buildModalTextDisplay(explanation),
        buildModalCheckboxField({
            label: publishing ? 'Confirm publication' : 'Confirm website deletion',
            description: publishing ? 'Publish and begin automatic synchronization.' : 'Move the website post to trash.',
            customId: 'confirmed',
        }),
    ));
}

function showPublishConfirmation(interaction, parts, state) {
    return showConfirmation(interaction, parts, state, 'publish');
}

function showDeleteConfirmation(interaction, parts, state) {
    return showConfirmation(interaction, parts, state, 'delete');
}

async function replacePanel(interaction, state) {
    const events = await scheduledEvents.listCurrentEvents(interaction.guildId);
    const visibleState = pagination.getVisibleState(interaction.message);
    const payload = buildPanel(events, interaction.guildId, interaction.user.id);
    pagination.selectPayloadPageFromState(payload, visibleState);
    completePanelInteraction(interaction);
    state.panelSession.dispose();
    return interaction.editReply(payload);
}

function assertConfirmed(interaction) {
    if (!getModalCheckbox(interaction, 'confirmed')) {
        throw new Error('Confirm the action before submitting this form.');
    }
}

async function publish(interaction, parts, state) {
    assertConfirmed(interaction);
    await scheduledEvents.publishEvent(interaction.guildId, parts[0]);
    await replacePanel(interaction, state);
    return interaction.followUp({
        content: '✅ Event published to the website and automatic synchronization enabled.',
        flags: Discord.MessageFlags.Ephemeral,
    });
}

async function deleteWebsitePost(interaction, parts, state) {
    assertConfirmed(interaction);
    await scheduledEvents.requestWebsiteDeletion(interaction.guildId, parts[0]);
    await replacePanel(interaction, state);
    return interaction.followUp({
        content: '✅ The website post was moved to trash. The Discord event was not changed.',
        flags: Discord.MessageFlags.Ephemeral,
    });
}

async function refresh(interaction, _parts, state) {
    await interaction.deferUpdate();
    await scheduledEvents.reconcile(interaction.guild, { reason: 'manual' });
    await replacePanel(interaction, state);
    return interaction.followUp({
        content: '✅ Discord events and published website posts were refreshed.',
        flags: Discord.MessageFlags.Ephemeral,
    });
}

async function respondError(interaction, message, acknowledgement) {
    return respondAfterAcknowledgement(interaction, acknowledgement, {
        embeds: [errorEmbed(message)],
    }, { followUp: true });
}

const router = createInteractionRouter({
    parse: sessions.parse,
    componentActions: {
        page: pagination.handleInteraction,
        refresh,
        confirmPublish: showPublishConfirmation,
        confirmDelete: showDeleteConfirmation,
    },
    modalActions: { publish, delete: deleteWebsitePost },
    authorize: async ({ interaction, parsed }) => {
        if (String(interaction.user?.id) !== String(parsed.ownerUserId)) {
            await interaction.reply({ embeds: [errorEmbed('This panel belongs to another administrator.')], flags: Discord.MessageFlags.Ephemeral });
            return false;
        }
        if (String(interaction.guildId) !== String(parsed.guildId)) {
            await interaction.reply({ embeds: [errorEmbed('This panel belongs to another server.')], flags: Discord.MessageFlags.Ephemeral });
            return false;
        }
        return true;
    },
    acknowledgeModal: ({ interaction, parsed }) => acknowledgePanelInteraction(interaction, {
        sourceCustomId: parsed.state.sourceCustomId,
        panelSession: parsed.state.panelSession,
        formGeneration: parsed.state.formGeneration,
    }),
    onExpired: ({ interaction }) => interaction.reply({
        embeds: [errorEmbed('This panel expired. Run `/event-settings` again.')],
        flags: Discord.MessageFlags.Ephemeral,
    }),
    onComponentError: ({ interaction, error }) => respondError(interaction, error.message),
    onModalError: ({ interaction, error }) => respondError(interaction, error.message),
});

async function execute(interaction) {
    await deferEphemeralReply(interaction);
    try {
        const events = await scheduledEvents.listCurrentEvents(interaction.guildId);
        return interaction.editReply(buildPanel(events, interaction.guildId, interaction.user.id));
    }
    catch (error) {
        return interaction.editReply({ embeds: [errorEmbed(error.message)] });
    }
}

function handleInteraction(interaction) {
    if (interaction.isButton?.()) return router.handleComponent(interaction);
    if (interaction.isModalSubmit?.()) return router.handleModal(interaction);
    return false;
}

module.exports = { buildPanel, execute, handleInteraction };
