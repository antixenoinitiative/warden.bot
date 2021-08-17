const db = require("../../db/index");
const Discord = require("discord.js");
const { getSortedRoleIDs } = require("../../discord/getSortedRoleIDs");
module.exports = {
  name: "getbackup",
  description: "Sends a list of the backed up roles in DB",
  usage: "userID/@mention",
  permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
  execute(message) {
    try {
      let words = message.content.split(" ");
      let userID;
      if (words[1].startsWith("<@&")) {
        throw "You have to ping a user or type their id";
      } else {
        if (words[1].startsWith("<@") && words[1].endsWith(">")) {
          words[1] = words[1].slice(2, -1);
          if (words[1].startsWith("!")) {
            words[1] = words[1].slice(1);
          }
        }
        userID = words[1];
      }
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
            if(value.includes(sortedallvalues[i][0]))
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
            .addField("Name", username)
            .addField("Roles", "```" + namestring + "```");
          message.channel.send({ embeds: [returnEmbed.setTimestamp()] });
        }
      });
    } catch (err) {
      message.channel.send(`Something went wrong ${err}`);
    }
  },
};
