const db = require('../../db/index');
const Discord = require("discord.js");
module.exports = {
    name: 'backup',
	description: 'Creates a backup of current users and their roles',
	usage: '',
	permlvl: 2, // 0 = Everyone, 1 = Mentor, 2 = Staff
    execute (message) {
        let roles = {}
        let members = message.guild.members.cache
        members.forEach(member =>{
            roles[member.user.id] = member._roles;
        })
        try
        {
            db.takeBackup(roles).then((result)=>
            {
                if(result != "Failed")
                {
                    if(result[0] == '00'){message.channel.send({ content: "No changes were needed!"})}
                    if(result[0] == '01'){message.channel.send({ content: `Some new entries were added, added count = ${result[2]}`})}
                    if(result[0] == '10'){message.channel.send({ content: `Some entries were updated, updated count = ${result[1]}`})}
                    if(result[0] == '11'){message.channel.send({ content: `Some entries were updated and some were added, updated count = ${result[1]}, added count = ${result[2]}`})}
                }
                else
                {
                    throw "Result returned Failed"
                }
            })
        }
        catch(err)
        {
            message.channel.send(`Something went wrong ${err}`);
        }
    }
};