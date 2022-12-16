const Discord = require("discord.js");

module.exports = {
  data: new Discord.SlashCommandBuilder()
	.setName('roleinfo')
	.setDescription('Get information about a role')
  .addRoleOption(option => option.setName('role')
		.setDescription('The role to target')
		.setRequired(true)),
	permissions: 0,
	execute(interaction) {
		try {
      let roleID = interaction.options.data.find(arg => arg.name === 'role').value
      let role = interaction.guild.roles.cache.get(roleID)

      const returnEmbed = new Discord.EmbedBuilder()
      .setColor('#FF7100')
      .setTitle(`**Role Info - ${role.name}**`)
      .setDescription(`Role information for ${role}`)
      .addFields(
        {name: "Name", value: "```" + role.name + "```", inline: true},
        {name: "ID", value: "```" + roleID + "```", inline: true},
        {name: "Total Members", value: "```" + role.members.size + "```", inline: true},
        {name: "Color", value: "```" + role.hexColor + "```", inline: true},
        {name: "Position", value: "```" + role.rawPosition + "```", inline: true},
        {name: "Created", value: "```" + role.createdAt + "```", inline: true},
      )
      interaction.reply({ embeds: [returnEmbed.setTimestamp()] });

    }
      catch(err) {
        console.error(err);
        interaction.reply({ content: `Something went wrong, please try again!` })
      }
	},
};
