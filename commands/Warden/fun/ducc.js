const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`ducc`)
    .setDescription(`Summon the Ducc!`),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    execute (interaction) {
        let c;
        if (interaction.member.id == "274853598280810496") {
            c = Math.random() * 100;
            if (c < 50) {
                interaction.reply({ content: `Oh no, not you again` });
            }
            else {
                interaction.reply({ content: `Shoo... go away...` });
            }
            return
        }

        c = Math.random() * 100;
        if (c < 50) {
            interaction.reply({ content: `You summoneth the ducc! <@211624816619290624>`, files:["https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif"] });
        }
        else {
            interaction.reply({ content: `Who summons the duck-man?! <@211624816619290624>`, files:["https://cdn.discordapp.com/attachments/625989888432537611/668012845925138442/duckswag.gif"] });
        }

    }
}