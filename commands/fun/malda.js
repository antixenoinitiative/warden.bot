const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`malda`)
    .setDescription(`Annoy MalzaCAr with pings`),
    permissions: 0,

    async execute(interaction) {
        if (interaction.member.id == "585889289724755989") {
            await interaction.reply({content: "<@585889289724755989>"}); //585889289724755989 doge's id
        }

        else {
            await interaction.reply( {content: `<@274853598280810496> AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA 
https://cdn.discordapp.com/attachments/763535317360705606/919244730691358770/200w.gif`} );

        }
    }
}
