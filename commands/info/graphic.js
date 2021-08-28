const Discord = require("discord.js");
const data = require("./graphdata.json");
const { SlashCommandBuilder } = require('@discordjs/builders');

function isValid(args) {
    for (const value of data) {
        if (args === value.argument) {
            return true;
        }
    }
    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
	.setName('graphic')
	.setDescription('Request a graphic, diagram or resource from a repository, use "-graphic" to get a list.'),
    permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    usage: '"graphicname"',
    execute(message, args) {
        let response;
        if (!isValid(args[0])) {
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle("Graphics")
            .setDescription("List of valid graphic commands")
            for (const value of data) {
                returnEmbed.addField(`-graphic ${value.argument}`, value.title);
            }
            return message.channel.send({ embeds: [returnEmbed.setTimestamp()] });
        }

        for (const value of data) {
            if (args[0] === value.argument) {
                response = value;
            }
        }

        if (response.type == "text") {
            message.channel.send(response.link);
        } else if (response.type == "embed") {
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle(response.title)
            .setDescription(response.description)
            .setImage(response.link)
            message.channel.send({ embeds: [returnEmbed.setTimestamp()] });
        } else {
            //NOTE is something supposed to go here ?
        }
    }
};
