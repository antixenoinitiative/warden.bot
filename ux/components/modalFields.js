'use strict';

const Discord = require('discord.js');

const DISCORD_ADMIN_UI_LIMITS = Object.freeze({
    modalComponents: 5,
    customIdLength: 100,
    modalLabelLength: 45,
    selectOptions: 25,
    textInputLength: 4000,
    textInputPlaceholderLength: 100,
});

function truncateModalLabel(label) {
    const text = String(label ?? 'Input');
    const limit = DISCORD_ADMIN_UI_LIMITS.modalLabelLength;
    return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function truncateSelectText(text, maxLength = 100) {
    const value = String(text ?? '').trim() || 'Option';
    return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function assertCustomId(customId, label) {
    if (!String(customId ?? '') || String(customId).length > DISCORD_ADMIN_UI_LIMITS.customIdLength) {
        throw new Error(`${label} custom IDs must be 1-${DISCORD_ADMIN_UI_LIMITS.customIdLength} characters.`);
    }
}

function assertModalLabelSupport() {
    if (typeof Discord.LabelBuilder !== 'function') {
        throw new Error('This discord.js version cannot safely render labeled admin modals.');
    }
}

function buildModalTextDisplay(content) {
    if (typeof Discord.TextDisplayBuilder !== 'function') {
        throw new Error('This discord.js version cannot safely render modal text displays.');
    }
    const normalized = String(content ?? '').trim();
    if (!normalized) throw new Error('Modal text displays cannot be empty.');
    return new Discord.TextDisplayBuilder().setContent(
        normalized.slice(0, DISCORD_ADMIN_UI_LIMITS.textInputLength),
    );
}

function buildModalCheckboxField({
    label,
    description,
    customId,
    checked = false,
} = {}) {
    assertModalLabelSupport();
    if (typeof Discord.CheckboxBuilder !== 'function') {
        throw new Error('This discord.js version cannot safely render modal checkboxes.');
    }
    assertCustomId(customId, 'Checkbox');
    const checkbox = new Discord.CheckboxBuilder()
        .setCustomId(customId)
        .setDefault(Boolean(checked));
    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setCheckboxComponent(checkbox);
    if (description) {
        modalLabel.setDescription(
            String(description).slice(0, DISCORD_ADMIN_UI_LIMITS.textInputPlaceholderLength),
        );
    }
    return modalLabel;
}

function getModalCheckbox(interaction, customId) {
    if (typeof interaction.fields?.getCheckbox !== 'function') {
        throw new Error('This discord.js version cannot read modal checkboxes.');
    }
    return interaction.fields.getCheckbox(customId) === true;
}

function buildModalTextInputComponent(customId, {
    style = Discord.TextInputStyle.Short,
    placeholder,
    value,
    required = false,
    minLength,
    maxLength,
} = {}) {
    assertCustomId(customId, 'Modal input');
    const resolvedMaxLength = maxLength === undefined ? undefined : Number(maxLength);
    if (
        resolvedMaxLength !== undefined
        && (!Number.isInteger(resolvedMaxLength)
            || resolvedMaxLength < 1
            || resolvedMaxLength > DISCORD_ADMIN_UI_LIMITS.textInputLength)
    ) {
        throw new Error(`Admin text input max length must be between 1 and ${DISCORD_ADMIN_UI_LIMITS.textInputLength}.`);
    }

    const input = new Discord.TextInputBuilder()
        .setCustomId(customId)
        .setStyle(style)
        .setRequired(required);

    if (placeholder) {
        input.setPlaceholder(String(placeholder).slice(0, DISCORD_ADMIN_UI_LIMITS.textInputPlaceholderLength));
    }
    if (value !== undefined && value !== null) {
        const textValue = String(value);
        const maxValueLength = resolvedMaxLength ?? DISCORD_ADMIN_UI_LIMITS.textInputLength;
        if (textValue.length > maxValueLength) {
            throw new Error(`Existing admin field value exceeds its ${maxValueLength}-character editor limit.`);
        }
        if (textValue.length > 0) input.setValue(textValue);
    }
    if (minLength !== undefined) input.setMinLength(minLength);
    if (resolvedMaxLength !== undefined) input.setMaxLength(resolvedMaxLength);
    return input;
}

function buildModalTextLabel(customId, label, options = {}) {
    assertModalLabelSupport();
    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setTextInputComponent(buildModalTextInputComponent(customId, options));
    if (options.description) {
        modalLabel.setDescription(
            String(options.description).slice(0, DISCORD_ADMIN_UI_LIMITS.textInputPlaceholderLength),
        );
    }
    return modalLabel;
}

function buildExistingTextField({
    customId,
    label,
    currentValue,
    style = Discord.TextInputStyle.Short,
    maxLength,
    required = false,
    description = 'Edit the current value. Use the explicit reset action to restore template values.',
    placeholder = 'Edit current value…',
} = {}) {
    return buildModalTextLabel(customId, label, {
        style,
        value: currentValue ?? '',
        maxLength,
        required,
        description,
        placeholder,
    });
}

function getModalTextInput(interaction, customId) {
    return String(interaction.fields.getTextInputValue(customId) ?? '').trim();
}

function getModalSelectValues(interaction, customId) {
    if (typeof interaction.fields?.getStringSelectValues !== 'function') {
        throw new Error('This discord.js version cannot read modal select values.');
    }
    return interaction.fields.getStringSelectValues(customId)
        .map((value) => String(value).trim())
        .filter(Boolean);
}

function getModalSingleSelectValue(interaction, customId) {
    return getModalSelectValues(interaction, customId)[0];
}

function buildModalStringSelectLabel(label, select, { description } = {}) {
    assertModalLabelSupport();
    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setStringSelectMenuComponent(select);
    if (description) {
        modalLabel.setDescription(
            String(description).slice(0, DISCORD_ADMIN_UI_LIMITS.textInputPlaceholderLength),
        );
    }
    return modalLabel;
}

function buildStringSelectOption(option, selectedValues) {
    const selectOption = new Discord.StringSelectMenuOptionBuilder()
        .setLabel(truncateSelectText(option.label ?? option.value))
        .setValue(String(option.value));
    if (option.description) selectOption.setDescription(truncateSelectText(option.description));
    if (option.emoji) selectOption.setEmoji(option.emoji);
    if (selectedValues.has(String(option.value))) selectOption.setDefault(true);
    return selectOption;
}

function buildStringSelectComponent({
    customId,
    placeholder,
    options,
    selectedValues = [],
    minValues = 1,
    maxValues = 1,
    required,
}) {
    assertCustomId(customId, 'Select');
    if (!Array.isArray(options) || options.length < 1 || options.length > DISCORD_ADMIN_UI_LIMITS.selectOptions) {
        throw new Error(`Discord select menus require 1-${DISCORD_ADMIN_UI_LIMITS.selectOptions} options.`);
    }
    if (!Number.isInteger(minValues) || !Number.isInteger(maxValues)
        || minValues < 0 || maxValues < 1 || minValues > maxValues || maxValues > options.length) {
        throw new Error('Select value limits must be valid for the available options.');
    }
    const selectedValueSet = new Set([].concat(selectedValues)
        .map((value) => String(value).trim())
        .filter(Boolean));
    const select = new Discord.StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(truncateSelectText(placeholder ?? 'Choose an option...'))
        .setMinValues(minValues)
        .setMaxValues(maxValues)
        .addOptions(options.map((option) => buildStringSelectOption(option, selectedValueSet)));
    if (required !== undefined) select.setRequired?.(required);
    return select;
}

function buildModalStringSelectField({ label, description, required = true, ...selectOptions }) {
    return buildModalStringSelectLabel(
        label,
        buildStringSelectComponent({ ...selectOptions, required }),
        { description },
    );
}

function buildModalRoleSelectField({
    label,
    description,
    customId,
    placeholder,
    selectedRoleId,
    required = true,
}) {
    assertModalLabelSupport();
    assertCustomId(customId, 'Role select');
    const select = new Discord.RoleSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(truncateSelectText(placeholder ?? 'Choose a role...'))
        .setMinValues(required ? 1 : 0)
        .setMaxValues(1);
    select.setRequired?.(required);
    if (selectedRoleId) select.setDefaultRoles(selectedRoleId);

    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setRoleSelectMenuComponent(select);
    if (description) {
        modalLabel.setDescription(
            String(description).slice(0, DISCORD_ADMIN_UI_LIMITS.textInputPlaceholderLength),
        );
    }
    return modalLabel;
}

function getModalSelectedRole(interaction, customId) {
    if (typeof interaction.fields?.getSelectedRoles !== 'function') {
        throw new Error('This discord.js version cannot read modal role selections.');
    }
    return interaction.fields.getSelectedRoles(customId, true)?.first();
}

function buildModalUserSelectField({
    label,
    description,
    customId,
    placeholder,
    selectedUserId,
    required = true,
}) {
    assertModalLabelSupport();
    assertCustomId(customId, 'User select');
    const select = new Discord.UserSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(truncateSelectText(placeholder ?? 'Choose a user...'))
        .setMinValues(required ? 1 : 0)
        .setMaxValues(1);
    select.setRequired?.(required);
    if (selectedUserId) select.setDefaultUsers(String(selectedUserId));

    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setUserSelectMenuComponent(select);
    if (description) {
        modalLabel.setDescription(
            String(description).slice(0, DISCORD_ADMIN_UI_LIMITS.textInputPlaceholderLength),
        );
    }
    return modalLabel;
}

function getModalSelectedUser(interaction, customId) {
    if (typeof interaction.fields?.getSelectedUsers !== 'function') {
        throw new Error('This discord.js version cannot read modal user selections.');
    }
    return interaction.fields.getSelectedUsers(customId, true)?.first();
}

function buildModalChannelSelectField({
    label,
    description,
    customId,
    placeholder,
    selectedChannelId,
    channelTypes = [
        Discord.ChannelType.GuildText,
        Discord.ChannelType.GuildAnnouncement,
        Discord.ChannelType.PublicThread,
        Discord.ChannelType.PrivateThread,
        Discord.ChannelType.AnnouncementThread,
    ],
    required = true,
}) {
    assertModalLabelSupport();
    assertCustomId(customId, 'Channel select');
    const select = new Discord.ChannelSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(truncateSelectText(placeholder ?? 'Choose a channel...'))
        .setMinValues(required ? 1 : 0)
        .setMaxValues(1)
        .setChannelTypes(...channelTypes);
    select.setRequired?.(required);
    if (selectedChannelId) select.setDefaultChannels(String(selectedChannelId));

    const modalLabel = new Discord.LabelBuilder()
        .setLabel(truncateModalLabel(label))
        .setChannelSelectMenuComponent(select);
    if (description) {
        modalLabel.setDescription(
            String(description).slice(0, DISCORD_ADMIN_UI_LIMITS.textInputPlaceholderLength),
        );
    }
    return modalLabel;
}

function getModalSelectedChannel(interaction, customId) {
    if (typeof interaction.fields?.getSelectedChannels !== 'function') {
        throw new Error('This discord.js version cannot read modal channel selections.');
    }
    return interaction.fields.getSelectedChannels(customId, true)?.first();
}

function getAllowedOptionValues(options) {
    return new Set(options.map((option) => String(option.value)));
}

function getRequiredModalSingleSelect(interaction, customId, options, fieldLabel) {
    const value = getModalSingleSelectValue(interaction, customId);
    if (!value || !getAllowedOptionValues(options).has(String(value))) {
        throw new Error(`Please select a valid ${fieldLabel}.`);
    }
    return value;
}

function buildModal(customId, title, ...components) {
    assertModalLabelSupport();
    const modalComponents = components.flat().filter(Boolean);
    assertCustomId(customId, 'Modal');
    if (!String(title ?? '').trim()) throw new Error('Discord modals require a title.');
    if (modalComponents.length < 1 || modalComponents.length > DISCORD_ADMIN_UI_LIMITS.modalComponents) {
        throw new Error(
            `Discord modals require 1-${DISCORD_ADMIN_UI_LIMITS.modalComponents} components; "${title}" has ${modalComponents.length}.`,
        );
    }
    const modal = new Discord.ModalBuilder()
        .setCustomId(customId)
        .setTitle(String(title).slice(0, 45));
    for (const component of modalComponents) {
        const data = component?.toJSON?.() ?? component;
        if (data?.type === Discord.ComponentType.Label) modal.addLabelComponents(component);
        else if (data?.type === Discord.ComponentType.TextDisplay) modal.addTextDisplayComponents(component);
        else throw new Error('Discord modals support label and text-display components in this helper.');
    }
    return modal;
}

module.exports = {
    buildExistingTextField,
    buildModal,
    buildModalCheckboxField,
    buildModalChannelSelectField,
    buildModalRoleSelectField,
    buildModalStringSelectField,
    buildModalTextLabel,
    buildModalTextDisplay,
    buildModalUserSelectField,
    buildStringSelectComponent,
    getAllowedOptionValues,
    getModalCheckbox,
    getModalSelectedChannel,
    getModalSelectedRole,
    getModalSelectedUser,
    getModalSelectValues,
    getModalSingleSelectValue,
    getModalTextInput,
    getRequiredModalSingleSelect,
    truncateSelectText,
};
