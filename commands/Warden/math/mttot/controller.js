'use strict';

const { randomBytes } = require('node:crypto');
const Discord = require('discord.js');
const { createConsoleReporter } = require('../../../../logging/consoleReporting');
const { createUXPanelDocument } = require('../../../../ux/documents');
const { buildLoadingComponents } = require('../../../../ux/components/state');
const { renderComponentsV2 } = require('../../../../ux/renderers/componentsV2');
const { createPanelSessionRegistry } = require('../../../../ux/interactions/sessions');
const { createInteractionRouter } = require('../../../../ux/interactions/router');
const { createReusablePanelPublisher } = require('../../../../ux/interactions/reusablePublication');
const {
    expectedInteractionError,
    reportUnexpectedInteractionError,
} = require('../../../../ux/interactions/errors');
const {
    acknowledgePanelInteraction,
    completePanelInteraction,
    respondAfterAcknowledgement,
    sanitizeMessageEditOptions,
} = require('../../../../ux/interactions/acknowledgement');
const {
    buildModal,
    buildModalStringSelectField,
    buildModalTextLabel,
    buildStringSelectComponent,
    getModalSingleSelectValue,
    getModalTextInput,
} = require('../../../../ux/components/modalFields');
const {
    INTERCEPTOR_OPTIONS,
    SIZE_OPTIONS,
    interceptorOptionsForIdentity,
    labelFor,
    mountOptionsForIdentity,
    optionsForMount,
    optionsForWeapon,
    weaponOptionsForIdentity,
    weapons,
} = require('./catalog');
const { MAX_ITERATION, buildMttotEmbed, simulateMttot } = require('./calculator');
const { resolveMttotBrandColor, resolveMttotIdentityName } = require('./identity');
const {
    MAX_UNIQUE_WEAPON_TYPES,
    MAX_WEAPON_QUANTITY,
    parseWeaponPrefill,
} = require('./weaponPrefill');

const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_PANEL_WEAPON_QUANTITY = 25;
const CALCULATE_COOLDOWN_MS = 10_000;
const report = createConsoleReporter('MTToT').forSubsystem('Interactive panel');
const sessions = createPanelSessionRegistry({
    prefix: 'mt',
    label: 'MTToT',
    ttlMs: SESSION_TTL_MS,
    maxEntries: 150,
});

function createPendingWeapon() {
    return {
        token: randomBytes(6).toString('base64url'),
        quantity: null,
        size: null,
        mount: null,
    };
}

function initialFlow(interaction) {
    const suppliedAccuracy = interaction.options.getInteger('accuracy');
    const suppliedRange = interaction.options.getInteger('range');
    const weapons = parseWeaponPrefill(interaction.options.getString('weapon_codes'));
    return {
        accuracy: Math.min(100, suppliedAccuracy ?? 100),
        calculated: false,
        brandColor: resolveMttotBrandColor(),
        cooldownUntilMs: null,
        interceptor: null,
        identityName: resolveMttotIdentityName(),
        pendingWeapon: weapons.length === 0 ? createPendingWeapon() : null,
        publicationAttempt: null,
        publicationNonce: randomBytes(12).toString('hex'),
        range: suppliedRange ?? 0,
        verbose: interaction.options.getBoolean('verbose') ?? false,
        weapons,
    };
}

function completedWeapon(weapon) {
    return Boolean(weapon && weapon.quantity && weapon.code && weapons[weapon.code]);
}

function allWeaponsComplete(flow) {
    return flow.weapons.length > 0 && !flow.pendingWeapon && flow.weapons.every(completedWeapon);
}

function readyToCalculate(flow) {
    return Boolean(flow.interceptor && allWeaponsComplete(flow));
}

function weaponCodes(flow) {
    return flow.weapons.map((weapon) => `${weapon.quantity}${weapon.code}`).join(', ');
}

function brandColorFor(flow) {
    return flow.brandColor ?? resolveMttotBrandColor();
}

function selectRow(session, action, parts, placeholder, options, selectedValues = [], { disabled = false } = {}) {
    const select = buildStringSelectComponent({
        customId: session.build(action, ...[].concat(parts)),
        placeholder,
        options,
        selectedValues,
    }).setDisabled(disabled);
    return new Discord.ActionRowBuilder().addComponents(select);
}

const QUANTITY_OPTIONS = Object.freeze(Array.from({ length: MAX_PANEL_WEAPON_QUANTITY }, (_, index) => ({
    label: String(index + 1),
    value: String(index + 1),
})));

function unavailableOption(label) {
    return [{ label, value: 'unavailable' }];
}

function interceptorBlock(flow, session) {
    if (flow.publicationAttempt) {
        return [{
            kind: 'text',
            content: `### Interceptor\n**${flow.interceptor ?? 'Not selected'}**`,
        }];
    }
    return [{
        kind: 'group',
        blocks: [
            { kind: 'text', content: '### Interceptor\nChoose the Interceptor to simulate.' },
            {
                kind: 'actions',
                rows: [selectRow(
                    session,
                    'interceptor',
                    'environment',
                    'Choose an Interceptor...',
                    interceptorOptionsForIdentity(flow.identityName),
                    flow.interceptor ? [flow.interceptor] : [],
                )],
            },
        ],
    }];
}

function environmentBlock(flow, session) {
    return {
        kind: 'section',
        content: [`### Accuracy and Range\nAccuracy: **${flow.accuracy}%**\nRange: **${flow.range === 0 ? 'Point blank' : `${flow.range} m`}**`],
        accessory: flow.publicationAttempt ? undefined : new Discord.ButtonBuilder()
            .setCustomId(session.build('editEnvironment'))
            .setLabel('Edit')
            .setStyle(Discord.ButtonStyle.Secondary),
    };
}

function isAtUniqueWeaponCap(flow) {
    return flow.weapons.length >= MAX_UNIQUE_WEAPON_TYPES;
}

function eligibleWeaponOptions(flow, size, mount, additionalQuantity = 0) {
    const candidates = optionsForWeapon(size, mount);
    const existingByCode = new Map(flow.weapons.map((weapon) => [weapon.code, weapon]));
    return candidates.filter((option) => {
        const existing = existingByCode.get(option.value);
        if (!existing) return !isAtUniqueWeaponCap(flow);
        return existing.quantity + additionalQuantity <= MAX_WEAPON_QUANTITY;
    });
}

function eligibleMountOptions(flow, size, additionalQuantity = 0) {
    return optionsForMount(size).filter((mount) =>
        eligibleWeaponOptions(flow, size, mount.value, additionalQuantity).length > 0);
}

function eligibleSizeOptions(flow, additionalQuantity = 0) {
    return SIZE_OPTIONS.filter((size) => eligibleMountOptions(flow, size.value, additionalQuantity).length > 0);
}

function weaponDisplayName(code) {
    const name = weapons[code]?.name ?? code;
    const size = labelFor(SIZE_OPTIONS, String(code).charAt(0), '');
    const mount = labelFor(optionsForMount(String(code).charAt(0)), String(code).charAt(1), '');
    if (!size || !mount || name.toLocaleLowerCase().includes(mount.toLocaleLowerCase())) return name;
    return name.replace(new RegExp(`^${size}\\s+`, 'i'), `${size} ${mount} `);
}

function weaponSummaryLine(weapon) {
    return `- **${weapon.quantity}×** ${weaponDisplayName(weapon.code)}`;
}

function resetWeaponsButton(session) {
    return new Discord.ButtonBuilder()
        .setCustomId(session.build('resetWeapons'))
        .setLabel('Reset Weapons')
        .setStyle(Discord.ButtonStyle.Danger);
}

function cancelWeaponAdditionButton(session, additionToken) {
    return new Discord.ButtonBuilder()
        .setCustomId(session.build('cancelWeaponAddition', 'pending', additionToken))
        .setLabel('Cancel')
        .setStyle(Discord.ButtonStyle.Danger);
}

function addWeaponsButton(session) {
    return new Discord.ButtonBuilder()
        .setCustomId(session.build('addWeapons'))
        .setLabel('Add Weapons')
        .setStyle(Discord.ButtonStyle.Success);
}

function ensureWeaponSelectionFlow(flow) {
    if (flow.weapons.length === 0 && !flow.pendingWeapon && !flow.publicationAttempt) {
        flow.pendingWeapon = createPendingWeapon();
    }
    return flow;
}

function weaponsActionsBlock(flow, session) {
    const buttons = [addWeaponsButton(session)];
    if (flow.weapons.length > 0) buttons.push(resetWeaponsButton(session));
    return {
        kind: 'actions',
        rows: [new Discord.ActionRowBuilder().addComponents(...buttons)],
    };
}

function weaponsSummaryBlock(flow, session, { controlsStable = !flow.calculating } = {}) {
    const showEditingGuidance = !flow.pendingWeapon && !flow.publicationAttempt && controlsStable;
    const summary = [`### Selected Weapons`, ...flow.weapons.map(weaponSummaryLine)];
    if (showEditingGuidance) {
        summary.push('-# You may **EDIT** amounts of already selected weapon-types, or **ADD** more weapon-types below.');
    }
    return {
        kind: 'section',
        content: [summary.join('\n')],
        accessory: flow.publicationAttempt || flow.pendingWeapon ? undefined : new Discord.ButtonBuilder()
            .setCustomId(session.build('editWeapons'))
            .setLabel('Edit')
            .setStyle(Discord.ButtonStyle.Secondary),
    };
}

function pendingWeaponBlock(flow, session) {
    const pending = flow.pendingWeapon;
    if (!pending) return null;
    const routeParts = ['pending', pending.token];
    const hasQuantity = Number.isInteger(pending.quantity);
    const hasSize = Boolean(pending.size);
    const hasMount = Boolean(pending.mount);
    const mountAvailable = hasQuantity && hasSize;
    const weaponAvailable = mountAvailable && hasMount;
    const controls = [
        {
            action: 'weaponQuantity',
            options: QUANTITY_OPTIONS,
            placeholder: 'Choose quantity...',
            selected: hasQuantity ? [String(pending.quantity)] : [],
        },
        {
            action: 'weaponSize',
            options: eligibleSizeOptions(flow, pending.quantity ?? 1),
            placeholder: 'Choose weapon size...',
            selected: hasSize ? [pending.size] : [],
        },
        {
            action: 'mount',
            disabled: !mountAvailable,
            options: mountAvailable
                ? mountOptionsForIdentity(
                    eligibleMountOptions(flow, pending.size, pending.quantity),
                    flow.identityName,
                )
                : unavailableOption('Select quantity and size first'),
            placeholder: mountAvailable ? 'Choose mount type...' : 'Select quantity and size first...',
            selected: hasMount ? [pending.mount] : [],
        },
        {
            action: 'weapon',
            disabled: !weaponAvailable,
            options: weaponAvailable
                ? weaponOptionsForIdentity(
                    eligibleWeaponOptions(flow, pending.size, pending.mount, pending.quantity),
                    flow.identityName,
                )
                : unavailableOption('Select a mount type first'),
            placeholder: weaponAvailable ? 'Choose weapon...' : 'Select a mount type first...',
            selected: [],
        },
    ];
    return [
        { kind: 'text', content: '### Adding Weapons\nComplete the selections below.' },
        ...controls.map((control) => ({
            kind: 'actions',
            rows: [selectRow(
                session,
                control.action,
                routeParts,
                control.placeholder,
                control.options,
                control.selected,
                { disabled: Boolean(control.disabled) },
            )],
        })),
        ...(flow.weapons.length > 0 ? [{
            kind: 'actions',
            rows: [new Discord.ActionRowBuilder().addComponents(
                cancelWeaponAdditionButton(session, pending.token),
            )],
        }] : []),
    ];
}

function buildDocument(flow, session, { controlsStable = !flow.calculating } = {}) {
    ensureWeaponSelectionFlow(flow);
    const blocks = [
        { kind: 'text', content: '## Weapons' },
    ];
    if (flow.weapons.length > 0) blocks.push(weaponsSummaryBlock(flow, session, { controlsStable }));
    if (flow.pendingWeapon && !flow.publicationAttempt) {
        blocks.push(...pendingWeaponBlock(flow, session));
    } else if (!flow.publicationAttempt && flow.weapons.length > 0) {
        blocks.push(weaponsActionsBlock(flow, session));
    }
    blocks.push(
        { kind: 'separator', divider: true, spacing: 'Large' },
        { kind: 'text', content: '## Engagement' },
        environmentBlock(flow, session),
        ...interceptorBlock(flow, session),
    );

    const navigationActions = readyToCalculate(flow)
        ? [new Discord.ActionRowBuilder().addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(session.build('calculate'))
                .setLabel(flow.publicationAttempt ? 'Confirm Publication' : 'Calculate')
                .setStyle(Discord.ButtonStyle.Primary),
        )]
        : [];
    return createUXPanelDocument({
        title: 'MTToT Simulator',
        description: 'Configure an Anti-Xeno loadout to simulate its minimum time on target against a Thargoid Interceptor.',
        accentColor: brandColorFor(flow),
        editorBlocks: blocks,
        navigationActions,
        footer: 'Selections are private. The completed result will be posted publicly in this channel.',
        ephemeral: true,
    });
}

function renderPanel(flow, session, _sourceMessage, { initial = false, controlsStable } = {}) {
    const rendered = renderComponentsV2(buildDocument(flow, session, { controlsStable }));
    if (rendered.pages.length !== 1) {
        throw new Error('The compact MTToT panel unexpectedly exceeded Discord\'s component budget.');
    }
    return initial ? rendered.payload : sanitizeMessageEditOptions(rendered.payload);
}

function renderLockedPanel(flow, session, sourceMessage) {
    const payload = renderPanel(flow, session, sourceMessage, { controlsStable: false });
    return {
        ...payload,
        components: buildLoadingComponents(payload.components),
    };
}

function getFlow(state) {
    if (!state.flow) throw new Error('This MTToT session is unavailable.');
    return state.flow;
}

function getEditableFlow(state) {
    const flow = getFlow(state);
    if (flow.calculating) {
        throw expectedInteractionError('This MTToT calculation is already being published.');
    }
    if (flow.publicationAttempt) {
        throw expectedInteractionError('This calculation has already been submitted for publication. Confirm it before making changes.');
    }
    return flow;
}

function getPendingWeapon(flow, parts) {
    if (!flow.pendingWeapon) throw expectedInteractionError('There is no weapon addition awaiting selection.');
    const routeToken = String(parts?.[1] ?? '');
    if (!routeToken || routeToken !== flow.pendingWeapon.token) {
        throw expectedInteractionError('This weapon addition is no longer active.');
    }
    return flow.pendingWeapon;
}

function selectedValue(interaction) {
    const value = interaction.values?.[0];
    if (!value) throw expectedInteractionError('Please choose a valid option.');
    return String(value);
}

async function updatePanel(interaction, state) {
    const flow = getFlow(state);
    if (flow.calculating) throw expectedInteractionError('This MTToT calculation is already being published.');
    state.panelSession.invalidateForms();
    return interaction.update(renderPanel(flow, state.panelSession, interaction.message));
}

async function selectInterceptor(interaction, _parts, state) {
    const value = selectedValue(interaction);
    if (!INTERCEPTOR_OPTIONS.some((option) => option.value === value)) {
        throw expectedInteractionError('Please choose a valid Interceptor.');
    }
    getEditableFlow(state).interceptor = value;
    return updatePanel(interaction, state);
}

async function selectMount(interaction, parts, state) {
    const flow = getEditableFlow(state);
    const pending = getPendingWeapon(flow, parts);
    const value = selectedValue(interaction);
    if (!eligibleMountOptions(flow, pending.size, pending.quantity).some((option) => option.value === value)) {
        throw expectedInteractionError('Please choose a valid mount type.');
    }
    pending.mount = value;
    return updatePanel(interaction, state);
}

async function selectWeaponQuantity(interaction, parts, state) {
    const flow = getEditableFlow(state);
    const pending = getPendingWeapon(flow, parts);
    const value = selectedValue(interaction);
    if (!QUANTITY_OPTIONS.some((option) => option.value === value)) {
        throw expectedInteractionError(`Weapon quantity must be between 1 and ${MAX_PANEL_WEAPON_QUANTITY}.`);
    }
    pending.quantity = Number(value);
    pending.mount = null;
    if (pending.size && !eligibleSizeOptions(flow, pending.quantity)
        .some((option) => option.value === pending.size)) {
        pending.size = null;
    }
    return updatePanel(interaction, state);
}

async function selectWeaponSize(interaction, parts, state) {
    const flow = getEditableFlow(state);
    const pending = getPendingWeapon(flow, parts);
    const value = selectedValue(interaction);
    if (!eligibleSizeOptions(flow, pending.quantity ?? 1).some((option) => option.value === value)) {
        throw expectedInteractionError('Please choose a valid weapon size.');
    }
    pending.size = value;
    pending.mount = null;
    return updatePanel(interaction, state);
}

async function selectWeapon(interaction, parts, state) {
    const flow = getEditableFlow(state);
    const pending = getPendingWeapon(flow, parts);
    if (!pending.mount) throw expectedInteractionError('Choose a mount type before choosing a weapon.');
    const value = selectedValue(interaction);
    if (!eligibleWeaponOptions(flow, pending.size, pending.mount, pending.quantity)
        .some((option) => option.value === value)) {
        throw expectedInteractionError('Please choose a weapon matching the selected size and mount.');
    }
    const existing = flow.weapons.find((weapon) => weapon.code === value);
    if (existing) {
        const combinedQuantity = existing.quantity + pending.quantity;
        if (combinedQuantity > MAX_WEAPON_QUANTITY) {
            throw expectedInteractionError(
                `The combined weapon quantity cannot exceed ${MAX_WEAPON_QUANTITY.toLocaleString('en-US')}.`,
            );
        }
        existing.quantity = combinedQuantity;
    }
    else {
        if (isAtUniqueWeaponCap(flow)) {
            throw expectedInteractionError(`A loadout can contain at most ${MAX_UNIQUE_WEAPON_TYPES} unique weapon types.`);
        }
        flow.weapons.push({ code: value, quantity: pending.quantity });
    }
    flow.pendingWeapon = null;
    return updatePanel(interaction, state);
}

async function resetWeapons(interaction, _parts, state) {
    const flow = getEditableFlow(state);
    flow.weapons = [];
    flow.pendingWeapon = createPendingWeapon();
    flow.calculated = false;
    return updatePanel(interaction, state);
}

async function cancelWeaponAddition(interaction, parts, state) {
    const flow = getEditableFlow(state);
    getPendingWeapon(flow, parts);
    if (flow.weapons.length === 0) {
        throw expectedInteractionError('The initial weapon selection cannot be cancelled. Select a weapon to continue.');
    }
    flow.pendingWeapon = null;
    return updatePanel(interaction, state);
}

function showEnvironmentModal(interaction, _parts, state) {
    const flow = getEditableFlow(state);
    const customId = state.panelSession.buildForm('saveEnvironment', [], {}, interaction.customId);
    return interaction.showModal(buildModal(
        customId,
        'Accuracy and Range',
        buildModalTextLabel('accuracy', 'Accuracy', {
            description: 'Amount of damage output hit [%].',
            placeholder: 'Enter a whole number from 0 to 100.',
            value: String(flow.accuracy),
            required: true,
            maxLength: 10,
        }),
        buildModalTextLabel('range', 'Range', {
            description: 'Engagement range [m]',
            placeholder: 'Enter a non-negative whole number without a unit.',
            value: String(flow.range),
            required: true,
            maxLength: 12,
        }),
    ));
}

function startWeaponAddition(interaction, _parts, state) {
    const flow = getEditableFlow(state);
    if (flow.pendingWeapon) throw expectedInteractionError('Finish the current weapon addition before adding more weapons.');
    const sizeOptions = eligibleSizeOptions(flow, 1);
    if (sizeOptions.length < 1) {
        throw expectedInteractionError('No compatible weapon types remain available for this loadout.');
    }
    flow.pendingWeapon = createPendingWeapon();
    return updatePanel(interaction, state);
}

function summaryWeaponOptions(flow) {
    return flow.weapons.map((weapon) => ({
        label: `${weapon.quantity}× ${weaponDisplayName(weapon.code)}`,
        value: weapon.code,
    }));
}

function showEditWeaponsModal(interaction, _parts, state) {
    const flow = getEditableFlow(state);
    if (flow.pendingWeapon) throw expectedInteractionError('Finish the current weapon addition before editing the loadout.');
    const options = summaryWeaponOptions(flow);
    if (options.length < 1) throw expectedInteractionError('Add weapons before editing the loadout.');
    const customId = state.panelSession.buildForm('saveEditedWeapons', [], {}, interaction.customId);
    return interaction.showModal(buildModal(
        customId,
        'Edit Selected Weapons',
        buildModalStringSelectField({
            label: 'Weapon Type',
            customId: 'weapon',
            options,
            placeholder: 'Choose a selected weapon type...',
        }),
        buildModalTextLabel('quantity', 'New Weapon Quantity', {
            description: 'Enter the new total. Enter 0 to remove this weapon type.',
            placeholder: 'Enter a whole number',
            required: true,
            maxLength: 9,
        }),
    ));
}

function parseInteger(value, label) {
    if (!/^-?\d+$/.test(value)) throw expectedInteractionError(`${label} must be a whole number.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw expectedInteractionError(`${label} is outside the supported range.`);
    return parsed;
}

async function saveEnvironment(interaction, _parts, state) {
    const flow = getEditableFlow(state);
    const accuracy = parseInteger(getModalTextInput(interaction, 'accuracy'), 'Accuracy');
    const range = parseInteger(getModalTextInput(interaction, 'range'), 'Range');
    if (accuracy < 0) throw expectedInteractionError('Accuracy must be between 0 and 100.');
    if (range < 0) throw expectedInteractionError('Range cannot be negative.');
    flow.accuracy = Math.min(100, accuracy);
    flow.range = range;
    completePanelInteraction(interaction);
    return interaction.editReply(renderPanel(flow, state.panelSession, interaction.message));
}

async function saveEditedWeapons(interaction, _parts, state) {
    const flow = getEditableFlow(state);
    if (flow.pendingWeapon) throw expectedInteractionError('Finish the current weapon addition before editing the loadout.');
    const code = getModalSingleSelectValue(interaction, 'weapon');
    if (!code || !summaryWeaponOptions(flow).some((option) => option.value === code)) {
        throw expectedInteractionError('Please select a valid weapon type.');
    }
    const quantity = parseInteger(getModalTextInput(interaction, 'quantity'), 'Weapon quantity');
    if (quantity < 0 || quantity > MAX_WEAPON_QUANTITY) {
        throw expectedInteractionError(`Weapon quantity must be between 0 and ${MAX_WEAPON_QUANTITY.toLocaleString('en-US')}.`);
    }
    const index = flow.weapons.findIndex((weapon) => weapon.code === code);
    if (index < 0) throw expectedInteractionError('That weapon type is no longer selected.');
    if (quantity === 0) flow.weapons.splice(index, 1);
    else flow.weapons[index].quantity = quantity;
    if (flow.weapons.length === 0) flow.pendingWeapon = createPendingWeapon();
    completePanelInteraction(interaction);
    return interaction.editReply(renderPanel(flow, state.panelSession, interaction.message));
}

function createPublicationAttempt(flow, interaction) {
    const simulation = simulateMttot({
        interceptorName: flow.interceptor,
        weaponCodes: weaponCodes(flow),
        range: flow.range,
        accuracy: flow.accuracy,
        verbose: flow.verbose,
    });
    const messageOptions = simulation.limitReached
        ? {
            content: `Maximal number of iterations (${MAX_ITERATION}) reached. DPS is theoretically sufficient but extremely low.\n${simulation.diagnosticOutputString}`,
            nonce: flow.publicationNonce,
            enforceNonce: true,
        }
        : {
            embeds: [buildMttotEmbed(
                simulation,
                interaction.member,
                interaction.user,
                brandColorFor(flow),
            ).toJSON()],
            nonce: flow.publicationNonce,
            enforceNonce: true,
        };
    return Object.freeze({
        configuration: Object.freeze({
            accuracy: flow.accuracy,
            interceptor: flow.interceptor,
            range: flow.range,
            verbose: flow.verbose,
            weaponCodes: weaponCodes(flow),
        }),
        messageOptions: Object.freeze(messageOptions),
    });
}

function resetPublicationAttempt(flow) {
    flow.publicationAttempt = null;
    flow.publicationNonce = randomBytes(12).toString('hex');
}

function isDefinitePublicSendFailure(error) {
    const status = Number(error?.status ?? error?.httpStatus ?? error?.response?.status);
    return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

const publisher = createReusablePanelPublisher({
    cooldownMs: CALCULATE_COOLDOWN_MS,
    createAttempt: ({ interaction, model }) => createPublicationAttempt(model, interaction),
    errors: {
        alreadyPublishing: 'This MTToT calculation is already being published.',
        cooldown: (until) => `Calculate is available again <t:${Math.ceil(until / 1000)}:R>.`,
        notReady: 'Complete the environment and selected weapons first.',
        webhookUnavailable: 'The acknowledged MTToT panel cannot be restored because its interaction webhook is unavailable.',
    },
    getAttempt: (flow) => flow.publicationAttempt,
    getCooldownUntil: (flow) => flow.cooldownUntilMs,
    isBusy: (flow) => flow.calculating,
    isDefiniteFailure: isDefinitePublicSendFailure,
    isReady: readyToCalculate,
    markPublished: (flow) => { flow.calculated = true; },
    publishAttempt: ({ attempt, interaction }) => interaction.channel.send(attempt.messageOptions),
    renderEditable: ({ model, panelSession, sourceMessage }) => renderPanel(
        model,
        panelSession,
        sourceMessage,
        { controlsStable: true },
    ),
    renderLocked: ({ interaction, model, panelSession }) => renderLockedPanel(
        model,
        panelSession,
        interaction.message,
    ),
    reporter: report,
    resetAttempt: resetPublicationAttempt,
    setAttempt: (flow, attempt) => { flow.publicationAttempt = attempt; },
    setBusy: (flow, busy) => { flow.calculating = busy; },
    setCooldownUntil: (flow, until) => { flow.cooldownUntilMs = until; },
});

async function calculate(interaction, _parts, state) {
    return publisher.publish({
        interaction,
        model: getFlow(state),
        panelSession: state.panelSession,
        sourceMessage: interaction.message,
    });
}

async function privateError(interaction, message) {
    const payload = { content: String(message || 'The MTToT action failed.'), flags: Discord.MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
}

const router = createInteractionRouter({
    parse: sessions.parse,
    componentActions: {
        addWeapons: startWeaponAddition,
        calculate,
        cancelWeaponAddition,
        editEnvironment: showEnvironmentModal,
        editWeapons: showEditWeaponsModal,
        interceptor: selectInterceptor,
        mount: selectMount,
        resetWeapons,
        weapon: selectWeapon,
        weaponQuantity: selectWeaponQuantity,
        weaponSize: selectWeaponSize,
    },
    modalActions: {
        saveEditedWeapons,
        saveEnvironment,
    },
    authorize: async ({ interaction, parsed }) => {
        if (String(interaction.user?.id) !== String(parsed.ownerUserId)) {
            await privateError(interaction, 'This MTToT panel belongs to another commander.');
            return false;
        }
        if (String(interaction.guildId) !== String(parsed.guildId)) {
            await privateError(interaction, 'This MTToT panel belongs to another server.');
            return false;
        }
        return true;
    },
    acknowledgeModal: ({ interaction, parsed }) => acknowledgePanelInteraction(interaction, {
        sourceCustomId: parsed.state.sourceCustomId,
        panelSession: parsed.state.panelSession,
        formGeneration: parsed.state.formGeneration,
    }),
    onExpired: ({ interaction }) => privateError(interaction, 'This MTToT panel expired. Run `/mttot` again.'),
    onComponentError: async ({ interaction, error }) => {
        reportUnexpectedInteractionError(report, 'Panel action failed', error);
        return privateError(interaction, error.message);
    },
    onModalError: async ({ interaction, error }) => {
        reportUnexpectedInteractionError(report, 'Panel modal failed', error);
        return respondAfterAcknowledgement(interaction, undefined, {
            content: error.message,
        }, { followUp: true, reporter: report });
    },
});

async function execute(interaction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
    let flow;
    try {
        flow = initialFlow(interaction);
    } catch (error) {
        return interaction.editReply({ content: error.message });
    }
    flow.guildId = String(interaction.guildId);
    flow.ownerUserId = String(interaction.user.id);
    const panelSession = sessions.create({
        guildId: flow.guildId,
        ownerUserId: flow.ownerUserId,
        state: { flow },
    });
    try {
        return await interaction.editReply(renderPanel(flow, panelSession));
    } catch (error) {
        panelSession.dispose();
        throw error;
    }
}

function handleInteraction(interaction) {
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) return router.handleComponent(interaction);
    if (interaction.isModalSubmit?.()) return router.handleModal(interaction);
    return false;
}

module.exports = {
    CALCULATE_COOLDOWN_MS,
    MAX_PANEL_WEAPON_QUANTITY,
    MAX_UNIQUE_WEAPON_TYPES,
    allWeaponsComplete,
    completedWeapon,
    execute,
    handleInteraction,
    initialFlow,
    readyToCalculate,
    renderPanel,
    sessions,
    weaponCodes,
};
