module.exports = {
    name: "ducc",
    description: "Summons the holy ducc",
    usage: '',
    args: false,
    permissions: 2, // 0 = Everyone, 1 = Mentor, 2 = Staff
    restricted: true,
    hidden: true,
    execute (message, args, passArray) {
        message.channel.send(`You summoneth the ducc! <@211624816619290624>`);
        message.channel.send("https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif");
    }
}