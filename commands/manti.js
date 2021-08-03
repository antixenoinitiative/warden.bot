module.exports = {
    name: "stagger",
    description: "Summons the Staggerless Manti",
    args: false,
    permlvl: 0,
    restricted: true,
    hidden: true,
    execute (message) {
        message.channel.send(`You summoneth the Manti! <@119167263730434048>`);
    }
}