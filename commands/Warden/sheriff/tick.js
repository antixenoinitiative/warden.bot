/**
 * /tick
 * The command utilizes a http://elitebgs API endpoint to show the timestamp, the last tick occured.
 * 
 * @see <a href="https://elitebgs.app/api/ebgs/v5/ticks">https://elitebgs.app/api/ebgs/v5/ticks</a>
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */

const { botIdent } = require('../../../functions.js');
const config = require('../../../config.json');
const { tickURL, dateFormatPattern} = config[botIdent().activeBot.botName]
const moment = require("moment");
const fetch = require("node-fetch");
const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`tick`)
    .setDescription(`Shows the timestamp, the last tick occured.`),
        // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        permissions: 0,
    execute (interaction) {
        // param timeMin as unix timestamp e.g. 1618696860000
        // https://elitebgs.app/api/ebgs/v5/ticks?timeMin=1618696860000
        fetch(`${tickURL}`)
        .then(res => res.json())
        .then(data => { 
            var tick = moment(data[0]["time"]).utc().format(dateFormatPattern) + " UTC";
            return "Last Tick: " + tick;
        })
        .then(tick => interaction.reply({ content: tick }));
	}
};
