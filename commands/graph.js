const Discord = require("discord.js");
const data = require("./graphdata.json");

function isValid(args) {
    for (i=0;i < data.length; i++) {
        if (args == data[i].argument) {
            return true;
        }
    }
    return false;
}

module.exports = {
    name: 'graph',
    description: 'Request a graphic, diagram or resource from a repository, use "-graphic" to get a list.',
    permlvl: 0,
    format: '"graphname"',
    restricted: false,
    execute(message, args) {
        let response;
        if (!isValid(args)) {
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle("Graphics")
            .setDescription("List of valid graphic commands")
            for (i=0;i < data.length; i++) {
                returnEmbed.addField(`-graph ${data[i].argument}`, data[i].title);
            }
            return message.channel.send(returnEmbed.setTimestamp());
        }

        for (i=0;i < data.length; i++) {
            if (args == data[i].argument) {
                response = data[i];
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
            message.channel.send(returnEmbed.setTimestamp());
        } else {
            
        }
    }
};