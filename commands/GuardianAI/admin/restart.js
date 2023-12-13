const Discord = require("discord.js");
const { botIdent } = require('../../../functions')
// This command requires Administrator permissions.
// This command requires Administrator permissions.
// This command requires Administrator permissions.
// This command requires Administrator permissions.
// This command requires Administrator permissions.



// Requries PM2 to be installed
/**
 * @Website https://pm2.keymetrics.io/
 * @Description 
 * Great for maintaining bot startup and keep alive functionality. As well as automatic restarts on filesave.
 * Maintains great functionality for process logs of the bot
 * Has an ecosystem where you can run multiple processes if needed.
 * 
 * 
 * 
 * @install npm install pm2 -g
 * 
 * Run the ecosystem.
 * @run     pm2 start pm2-config.json
 * {
    "apps": [
        {
            "name":"GuardianAI",
            "script": "index.js",
            "ignore_watch": [".env",".git*",".ps1"],
            "watch": true,
            "exec_mode": "fork",
            "max_restarts": 1,
            "min_uptime": 5000
        }

    ]
   }

 * In the development area, you may wish to run error logging 
 * @run    pm2 logs
 * 
 * 
 * 
 * Finally, you should save PM2's configuration.
 * This will assist if the PM2 shuts down and comes back up for anyreason, the processlist will restart automatically.
 * @run    pm2 save 
 * 
 */
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