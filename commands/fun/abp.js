module.exports = {
    name: "abp",
    description: "Summons the holy ducc",
    usage: '',
    args: false,
    permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    execute (message) {
            message.channel.send({ content: `You summoneth the abp! <@321304077239582723>` });
    }
}
