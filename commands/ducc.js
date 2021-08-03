module.exports = {
    name: "ducc",
    description: "Summons the holy ducc",
    args: false,
    permlvl: 0,
    restricted: true,
    execute (messages, args, passArray) {
        if (message.content === '${prefix}ducc') {
            message.channel.send('You summoneth the ducc! @Mgram#6610 https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif%27');
        }
    }
}