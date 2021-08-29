const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`ducc`)
    .setDescription(`Summon the Ducc!`),
    permlvl: 2,
    execute (interaction) {
        var c = Math.random() * 100;
        if (c < 50) {
            interaction.reply({ content: `You summoneth the ducc! <@211624816619290624>` });
            interaction.channel.send({ content: "https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif" });
        }
        else {
            interaction.reply({ content: `Who summons the duck-man?! <@211624816619290624>` });
            interaction.channel.send({ content: "https://cdn.discordapp.com/attachments/625989888432537611/668012845925138442/duckswag.gif" });
        }
        
    }
}
