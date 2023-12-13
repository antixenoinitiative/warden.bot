const Discord = require("discord.js");
const { botIdent } = require('../../../functions')

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('restartbot')
        .setDescription('Restart This Bot')
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator),
    permissions: 0,
    async execute(interaction) {
        await interaction.reply({ content: 'Restarting Bot'})
        const { exec } = require('child_process')
        exec(`pm2 restart ${botIdent().activeBot.botName}`, (err, stdout, stderr) => {
            if (err) {
                console.error(err);
                return;
              }
              console.log(stdout);
        })
    } 
};