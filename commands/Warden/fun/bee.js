const Discord = require("discord.js");
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`bee`)
    .setDescription(`To be used when a Beex moment occurs (repeatable)`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        interaction.reply({ content:'<@694913462760898580> moment.', files:['https://media.discordapp.net/stickers/912726769180737596.webp'] });
    }
}
