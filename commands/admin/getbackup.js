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
  usage: "<userID or @mention>",
  permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
  async execute(message) {
    try {
      let userID = message.options.data[0].value
      let username = "<@!" + userID + ">";
      db.getBackup(userID).then((value) => {
        if (value == undefined) {
          const returnEmbed = new Discord.MessageEmbed()
            .setColor("#FF7100")
            .setAuthor(
              "The Anti-Xeno Initiative",
              "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png"
            )
            .setTitle("**Roles from Backup**")
            .addField("Name", username)
            .addField("Backup not found!", "** **");
          message.channel.send({ embeds: [returnEmbed.setTimestamp()] });
        } else {
          let sortedallvalues = getSortedRoleIDs(message);
          let namestring = "\n"
          for(var i=0;i<Object.keys(sortedallvalues).length;i++)
          {
            if(value.roles.includes(sortedallvalues[i][0]))
            {
              namestring+=sortedallvalues[i][1]+"\n"
            }
          }
          let last_updated = new Date(parseInt(value['last_saved'])).toUTCString()
          const returnEmbed = new Discord.MessageEmbed()
            .setColor("#FF7100")
            .setAuthor(
              "The Anti-Xeno Initiative",
              "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png"
            )
            .setTitle("**Roles from Backup**")
            .addField("Name", username)
            .addField("Roles", "```" + namestring + "```")
            .setFooter(`List was last updated at ${last_updated}`);
          message.channel.send({ embeds: [returnEmbed] });
        }
      });
    } catch (err) {
      message.channel.send(`Something went wrong ${err}`);
    }
  },
};
