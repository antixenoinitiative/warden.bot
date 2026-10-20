'use strict';

const Discord = require('discord.js');
const controller = require('./mttot/controller');
const { INTERCEPTOR_OPTIONS } = require('./mttot/catalog');
const { supportsMttotIdentity } = require('./mttot/identity');
const { autocompleteWeaponCodes } = require('./mttot/weaponPrefill');

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('mttot')
        .setDescription('Open the interactive MTToT simulator—press Enter, or optionally prefill values')
        .addStringOption((option) => option
            .setName('variant')
            .setDescription('Optional: prefill the Interceptor variant')
            .addChoices(...INTERCEPTOR_OPTIONS.map(({ label, value }) => ({ name: label, value })))
            .setRequired(false))
        .addStringOption((option) => option
            .setName('weapon_codes')
            .setDescription('Optional: prefill weapons by code; suggestions appear as you type')
            .setAutocomplete(true))
        .addIntegerOption((option) => option
            .setName('range')
            .setDescription('Optional: prefill engagement range [m]')
            .setMinValue(0)
            .setRequired(false))
        .addIntegerOption((option) => option
            .setName('accuracy')
            .setDescription('Optional: prefill accuracy [%]')
            .setMinValue(0)
            .setRequired(false))
        .addBooleanOption((option) => option
            .setName('verbose')
            .setDescription('Optional: include detailed calculation output')
            .setRequired(false)),
    permissions: 0,
    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused(true);
            if (focused?.name !== 'weapon_codes') return interaction.respond([]);
            return interaction.respond(autocompleteWeaponCodes(focused.value));
        } catch (error) {
            console.error('Unable to resolve /mttot weapon-code autocomplete:', error.message);
            try {
                return await interaction.respond([]);
            } catch (_responseError) {
                return undefined;
            }
        }
    },
    execute: controller.execute,
    handleInteraction: controller.handleInteraction,
    supportsMttotIdentity,
};
