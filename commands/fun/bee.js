const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`bee`)
    .setDescription(`To be used when a Beex moment occurs (repeatable)`),
    permissions: 0,
    execute (interaction) {
        interaction.reply({ content: `<@694913462760898580> moment.` });
        interaction.channel.send({ content: "https://media.discordapp.net/stickers/912726769180737596.webp?size=240" });
    }
}
