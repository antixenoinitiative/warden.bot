const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`ducc`)
    .setDescription(`Summon the Ducc!`),
    usage: '',
    args: false,
    permlvl: 2, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    execute (message) {
        var c = Math.random() * 100;
        if (c < 50) {
            message.reply({ content: `You summoneth the ducc! <@211624816619290624>` });
            message.channel.send({ content: "https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif" });
        }
        else {
            message.reply({ content: `Who summons the duck-man?! <@211624816619290624>` });
            message.channel.send({ content: "https://cdn.discordapp.com/attachments/625989888432537611/668012845925138442/duckswag.gif" });
        }
        
    }
}
