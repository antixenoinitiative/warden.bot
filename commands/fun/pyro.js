const Discord = require("discord.js");
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`pyro`)
    .setDescription(`Summons the mythical Fire Chicken`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: `<@86435015272960000> rises from the ashes... You summon the mythical Fire Chicken!`, files:["https://media.discordapp.net/attachments/811555814748848148/1018797731596214282/unknown.png"] });
    }
}
