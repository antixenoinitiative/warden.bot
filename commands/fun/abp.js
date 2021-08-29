const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`abp`)
    .setDescription(`Summon aman!`),
    permlvl: 0,
    execute (interaction) {
            interaction.channel.send({ content: `You summoned Aman! <@321304077239582723>` });
    }
}
