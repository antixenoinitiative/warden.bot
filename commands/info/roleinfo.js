const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const { getRoleID } = require("../../discord/getRoleID");

module.exports = {
	name: 'roleinfo',
	description: 'Get information about a role',
  usage: '"role name"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
  args: true,
	execute(message, args) {
		try {
      let role = args[0].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
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
      .addFields(
        {name: "Name", value: "```" + actualrole + "```", inline: true},
        {name: "ID", value: "```" + roleID + "```", inline: true},
        {name: "Total Members", value: "```" + membercount + "```", inline: true},
      )
      message.channel.send({ embeds: [returnEmbed.setTimestamp()] });

    }
      catch(err) {
        console.error(err);
        message.channel.send({ content: `Something went wrong, please try again!` })
      }
	},
};
