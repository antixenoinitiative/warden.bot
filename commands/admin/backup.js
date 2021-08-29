const db = require('../../db/index');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`backup`)
    .setDescription(`Creates a backup of current users and their roles`),
	permissions: 2,
    async execute (interaction) {
        let roles = {}
        let members = interaction.guild.members.cache
        members.forEach(member =>{
            roles[member.user.id] = member._roles;
        })
        interaction.reply(`Running Backup Task 🛠`);
        try
        {
            db.takeBackup(roles,interaction.createdTimestamp).then((result)=>
            {
                if(result != "Failed")
                {
                    if(result[0] == '00'){interaction.channel.send({ content: `Complete: No changes were needed!`})}
                    if(result[0] == '01'){interaction.channel.send({ content: `Complete: Some new entries were added, added count = ${result[2]}`})}
                    if(result[0] == '10'){interaction.channel.send({ content: `Complete: Some entries were updated, updated count = ${result[1]}`})}
                    if(result[0] == '11'){interaction.channel.send({ content: `Complete: Some entries were updated and some were added, updated count = ${result[1]}, added count = ${result[2]}`})}
                }
                else
                {
                    throw "Result returned Failed"
                }
            })
        }
        catch(err)
        {
            console.error(err);
            interaction.channel.send(`Something went wrong ${err}`);
        }
    }
};