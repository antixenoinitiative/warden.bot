const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
	.setName('roleinfo')
	.setDescription('Get information about a role')
  .addRoleOption(option => option.setName('role')
		.setDescription('The role to target')
		.setRequired(true)),
	permlvl: 0,
	execute(interaction) {
		try {
      let role = interaction.options.data.find(arg => arg.name === 'role').value
      if(role.length < 2)
      {
          throw("Role name too short. Add more letters to role names for best results.")
      }
      let roleID = role
      let actualrole = cleanString(interaction.guild.roles.cache.find(role => role.id == roleID).name)
      let membercount = interaction.guild.roles.cache.get(roleID).members.size

      const returnEmbed = new Discord.MessageEmbed()
      .setColor('#FF7100')
      .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
      .setTitle(`**Role Info - ${actualrole}**`)
      .addFields(
        {name: "Name", value: "```" + actualrole + "```", inline: true},
        {name: "ID", value: "```" + roleID + "```", inline: true},
        {name: "Total Members", value: "```" + membercount + "```", inline: true},
      )
      interaction.reply({ embeds: [returnEmbed.setTimestamp()] });

    }
      catch(err) {
        console.error(err);
        interaction.reply({ content: `Something went wrong, please try again!` })
      }
	},
};
