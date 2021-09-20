const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = require("node-fetch");
const { zenURL } = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`zen`)
    .setDescription(`Gets you a random quote from https://zenquotes.io`),
//    .setDefaultPermission(false),
    permissions: 0,
    execute (interaction) {
        fetch(`${zenURL}`)
            .then(res => res.json())
            .then(data => data[0]["q"] + " - *" + data[0]["a"] +"*")
            .then(quote => interaction.channel.send(quote));
	}
};

