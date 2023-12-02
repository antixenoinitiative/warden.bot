const Discord = require("discord.js");
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`malda`)
    .setDescription(`Annoy MalzaCAr with pings`),
    permissions: 0,

    async execute(interaction) {
        switch (interaction.member.id) {
            case 585889289724755989:
                interaction.reply({content: "<@585889289724755989>"}); //585889289724755989 doge's id
                break;
            case 231298589148577792:
                interaction.reply({content: "No more, <@231298589148577792>"});
                break;
            default:
                await interaction.reply( {content: `<@274853598280810496> AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, files:["https://cdn.discordapp.com/attachments/763535317360705606/919244730691358770/200w.gif"]} );
        }
    }
}
