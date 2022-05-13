const db = require("../../db/index");
const Discord = require("discord.js");
const { getSortedRoleIDs } = require("../../discord/getSortedRoleIDs");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
  .setName(`getbackup`)
  .setDescription(`Get user roles from backup`)
  .addUserOption(option => option.setName('user')
			.setDescription('Mention user to get')
			.setRequired(true)),
  permissions: 0,
  async execute(interaction) {
    try {
      let userID = interaction.options.data.find(arg => arg.name === 'user').value
      let { rows } = await db.queryWarden("SELECT id FROM backups")
      let backupIndexes = []
      for (let backup of rows) {
        let id = parseInt(backup.id)
        backupIndexes.push(id)
      }
      let res = await db.queryWarden("SELECT * FROM backups WHERE id = $1", [Math.max.apply(null, backupIndexes)])
      let timestamp = parseInt(res.rows[0].timestamp.slice(0, -3))
      let data = res.rows[0].data
      let roles;
      for (let member of data) {
        let memberObj = JSON.parse(member)
        if (memberObj.user_id === userID) {
          roles = memberObj.roles
        }
      }
      let sortedallvalues = getSortedRoleIDs(interaction);
      let namestring = "\n"
      for(var i=0;i<Object.keys(sortedallvalues).length;i++)
      {
        if(roles.includes(sortedallvalues[i][0]))
        {
          namestring+=sortedallvalues[i][1]+"\n"
        }
      }
      const returnEmbed = new Discord.MessageEmbed()
        .setColor("#FF7100")
        .setAuthor(
          "The Anti-Xeno Initiative",
          "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png"
        )
        .setTitle("**Roles from Backup**")
        .setDescription(`Retrieved backup for ${await interaction.guild.members.fetch(userID)}. Backup Date: <t:${timestamp}>
        
        ${namestring}`)
        //.addField("Roles", "```" + namestring + "```")
      interaction.reply({ embeds: [returnEmbed] });
    } catch (err) {
      interaction.channel.send(`Something went wrong ${err}`);
    }
  },
};
