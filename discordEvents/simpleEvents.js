const { botLog } = require('../functions')

const exp = {
    messageDelete: async (interaction,bot) => {
        try {
            botLog(bot,new EmbedBuilder().setDescription(`Message deleted by user: ${message.author}` + '```' + `${message.content}` + '```').setTitle(`Message Deleted 🗑️`),1)
        } catch (err) {
            botLog(bot,new EmbedBuilder().setDescription(`Something went wrong while logging a Deletion event: ${err}`).setTitle(`Logging Error`),2);
        }
    },
    messageUpdate: async (interaction,bot) => {
        if (oldMessage != newMessage && oldMessage.author.id != process.env.CLIENTID) {
            botLog(bot,new EmbedBuilder().setDescription(`Message updated by user: ${oldMessage.author}` + '```' + `${oldMessage}` + '```' + `Updated Message:` + '```' + `${newMessage}` + '```' + `Message Link: ${oldMessage.url}`).setTitle(`Message Updated 📝`),1)
        }
    },
    guildMemberRemove: async (interaction,bot) => { 
        let roles = ``
        member.roles.cache.each(role => roles += `${role}\n`)
        botLog(bot,new EmbedBuilder()
        .setDescription(`User ${member.user.tag}(${member.displayName}) has left or was kicked from the server.`)
        .setTitle(`User Left/Kicked from Server`)
        .addFields(
            { name: `ID`, value: `${member.id}`},
            { name: `Date Joined`, value: `<t:${(member.joinedTimestamp/1000) >> 0}:F>`},
            { name: `Roles`, value: `${roles}`},
        ),2)
    }
}

module.exports = exp