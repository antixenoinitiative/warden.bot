module.exports = {
    name: "ducc",
    description: "Summons the holy ducc",
    args: false,
    permlvl: 0,
    restricted: true,
    execute (message, args, passArray) {
        message.channel.send(`You summoneth the ducc! <@Mgram#6610> https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif`);
    }
}