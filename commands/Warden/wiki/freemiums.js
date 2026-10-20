'use strict';

const Discord = require('discord.js');
const {
    getAxiWikiEmbedAuthor,
    getIdentityBrandColor,
} = require('../../../functions');

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('freemiums')
        .setDescription('How to retain premium ammunition through ship rebuys'),
    permissions: 0,
    execute(interaction) {
        const returnEmbed = new Discord.EmbedBuilder()
            .setColor(getIdentityBrandColor())
            .setTitle('Infinite Premium Ammo (Freemiums)')
            .setAuthor(getAxiWikiEmbedAuthor())
            .setDescription(
                'Premium Synths are expensive - but what if you could keep them beyond one fight? The trick is simple, make your insurance pay for them!\n\n' +
                'When rebuying your ship after a death, you respawn with the tier of ammunition that you had last loaded. This means that you can synth Premium Ammunition once, and then keep them as long as you choose to rebuy for your reload.\n\n' +
                'For most commanders in the late-game, credit cost is trivial compared to material-gathering. Note that this only works during fights that you can finish with one set of ammo, or in multiplayer-scenarios where other players hold the instance, while you rebuy to rearm.\n\n' +
                '### Be careful about the quick Rearm option\n\n' +
                '**_Clicking the rearm option at a station loads full basic ammo!_**\n\n' +
                'A few weapons will not respawn with a complete magazine or clip - be careful upon respawning with any of these weapons. You can use the advanced maintenance menu to be more selective about reloading modules like pre-engineered Heatsinks - which also do not respawn with a complete set.\n\n' +
                'AX weapons to note are:\n' +
                '- Modified Plasma Charger\n' +
                '- Modified Gauss Cannon',
            );

        const buttonRow = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.ButtonBuilder()
                    .setLabel('Learn more about Synthesis')
                    .setStyle(Discord.ButtonStyle.Link)
                    .setURL('https://wiki.antixenoinitiative.com/en/synthesis'),
            );

        return interaction.reply({
            embeds: [returnEmbed.setTimestamp()],
            components: [buttonRow],
        });
    },
};
