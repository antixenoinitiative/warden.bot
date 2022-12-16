/**
 * /zen
 * A fun command to get a random 'zen' quote from https://zenquotes.io
 * Note: Leads to funny moments as the quote often match the situation :D
 * 
 * @see <a href="https://zenquotes.io">https://zenquotes.io</a>
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */


const fetch = require("node-fetch");
const { zenURL } = require('../../config.json');
const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`zen`)
    .setDescription(`Gets you a random quote from https://zenquotes.io`),
    permissions: 0,
    execute (interaction) {
        fetch(`${zenURL}`)
        .then(res => res.json())
        .then(data => data[0]["q"] + " - *" + data[0]["a"] +"*")
        .then(quote => interaction.reply({ content: quote }));
	}
};
