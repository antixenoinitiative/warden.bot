const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`piggo`)
    .setDescription(`Summons the not so holy piggo`),
    usage: '',
    args: false,
    permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    execute (message) {
        message.reply({ content: `You summoneth the piggo! <@352201261971668992>` });
        message.channel.send({ content: "https://tenor.com/view/waddles-pig-blink-gravity-falls-animal-gif-17396160" });
    }
}
