module.exports = {
    name: "abp",
    description: "Summons the holy ducc",
    usage: '',
    args: false,
    permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    execute (interaction) {
            interaction.channel.send({ content: `You summoned Aman! <@321304077239582723>` });
    }
}
