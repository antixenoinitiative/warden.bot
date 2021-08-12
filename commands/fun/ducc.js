module.exports = {
    name: "ducc",
    description: "Summons the holy ducc",
    usage: '',
    args: false,
    permlvl: 2, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    execute (message) {
        message.channel.send({ content: `You summoneth the ducc! <@211624816619290624>` });
        message.channel.send({ content: "https://c.tenor.com/N3GVRxPTh-4AAAAM/duck-lmao.gif" });
    }
}
