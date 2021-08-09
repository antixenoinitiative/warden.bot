const { cleanString } = require("../discord/cleanString");
const { getRoleID } = require("../discord/getRoleID");
const Discord = require("discord.js");

module.exports = {
	name: 'roleinfo',
	description: 'Get information about a role',
    usage: '"role name"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	restricted: false,
	execute(message, args) {
		try {
            role = args[0].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
            if(role.length < 2)
            {
                throw("Role name too short. Add more letters to role names for best results.")
            }
            let roleID = getRoleID(message,role)
            let actualrole = cleanString(message.guild.roles.cache.find(role => role.id == roleID).name)
            let membercount = message.guild.roles.cache.get(roleID).members.size

            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle(`**Role Info - ${actualrole}**`)
            .addField("Name", "```" + actualrole + "```", true)
            .addField("ID", "```" + roleID + "```", true)
            .addField("Total Members", "```" + membercount + "```", true)
            message.channel.send(returnEmbed.setTimestamp());

        }
        catch(err)
        {
            message.channel.send(`Something went wrong, please try again!`)
        }
	},
};
