/**
 * /zen
 * A fun command to get a random 'zen' quote from https://zenquotes.io
 * Note: Leads to funny moments as the quote often match the situation :D
 * 
 * @see <a href="https://zenquotes.io">https://zenquotes.io</a>
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = require("node-fetch");
const { zenURL } = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
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
