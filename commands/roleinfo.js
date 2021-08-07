const { cleanString } = require("../discord/cleanString");
const { getRoleID } = require("../discord/getRoleID");
const Discord = require("discord.js");

module.exports = {
	name: 'roleinfo',
	description: 'Get information about a role',
    format: '"role name"',
	permlvl: 0,
	restricted: false,
	execute(message, args) {
		try {
            role = args[0].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
            if(role.length < 2)
            {
                throw("Role name too short. Add more letters to role names for best results.")
            }
            roleID = getRoleID(message,role)
            actualrole = cleanString(message.guild.roles.cache.find(role => role.id == roleID).name)
            
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle(`**Role Info - ${actualrole}**`)
            returnEmbed.addField("Name", "```" + actualrole + "```", true)
            returnEmbed.addField("ID", "```" + roleID + "```", true)
            message.channel.send(returnEmbed.setTimestamp());

        }
        catch(err)
        {
            message.channel.send(`Err ${err}`)
        }
	},
};
