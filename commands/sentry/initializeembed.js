const Discord = require("discord.js");
module.exports = {
    name: "initializeembed",
    description: "Creates a new embed and gives the relevant IDs",
    format: '',
    args: false,
    permlvl: 1,
    hidden: true,
    execute (message, args) {
       const newEmbed = new Discord.MessageEmbed()
      	.setColor('#FF7100')
      	.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
      	.setTitle("**Defense Targets**")
        .setDescription("\n Status: **CODE YELLOW** :yellow_square: \n All Incursions cleared and all Starports repaired.")
      message.channel.send(newEmbed).then(message => {
        message.channel.send("Server ID: " + message.guild.id + "\nChannel ID: " + message.channel.id + "\nMessage ID: " + message.id)
      })
    }
}
