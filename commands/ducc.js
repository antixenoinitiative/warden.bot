module.exports = {
    name: "ducc",
    description: "Summons the holy ducc",
    args: false,
    permlvl: 0,
    restricted: true,
    execute (message, args, passArray) {
        message.channel.send(`You summoneth the ducc! <@211624816619290624>`);
        message.channel.send("https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif");
    }
}