const db = require('../../db/index');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`backup`)
    .setDescription(`Creates a backup of current users and their roles`)
    .setDefaultPermission(false),
	permissions: 2,
    async execute (interaction) {
        let backup = []
        let members = interaction.guild.members.cache
        for (let member of members) {
            backup.push({
                user_id: member[0],
                roles: member[1]._roles
            })
        }
        try {
            await db.query("INSERT INTO backups(data, timestamp) VALUES($1, $2)", [backup, Date.now()])
        } catch (err) {
            interaction.reply({ content: "Something went wrong taking a backup. Please check event logs"})
            return
        }
        interaction.reply({ content: `Backup Job Complete!`})



        // members.forEach(member =>{
        //     roles[member.user.id] = member._roles;
        // })
        // interaction.reply({ content: `Running Backup Task 🛠`, ephemeral: true });
        // try
        // {
        //     db.takeBackup(roles,interaction.createdTimestamp).then((result)=>
        //     {
        //         if(result != "Failed")
        //         {
        //             if(result[0] == '00'){interaction.channel.send({ content: `Complete: No changes were needed!`})}
        //             if(result[0] == '01'){interaction.channel.send({ content: `Complete: Some new entries were added, added count = ${result[2]}`})}
        //             if(result[0] == '10'){interaction.channel.send({ content: `Complete: Some entries were updated, updated count = ${result[1]}`})}
        //             if(result[0] == '11'){interaction.channel.send({ content: `Complete: Some entries were updated and some were added, updated count = ${result[1]}, added count = ${result[2]}`})}
        //         }
        //         else
        //         {
        //             throw "Result returned Failed"
        //         }
        //     })
        // }
        // catch(err)
        // {
        //     console.error(err);
        //     interaction.channel.send(`Something went wrong ${err}`);
        // }
    }
};