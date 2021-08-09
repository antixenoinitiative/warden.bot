module.exports = {
    name: "invite",
    description: "Get a server invite link",
    usage: '',
    permissions: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    restricted: false,
    execute (message) {
        message.channel.send(`To invite people to the server, please use the following link: https://discord.gg/bqmDxdm`);
    }
}