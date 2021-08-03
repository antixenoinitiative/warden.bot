module.exports = {
    name: "stagger",
    description: "Summons the Staggerless Manti",
    args: false,
    permlvl: 0,
    restricted: true,
    hidden: true,
    execute (message) {
        messageslist = [`You summoneth the Manti! <@119167263730434048>`,`<@119167263730434048> Stagger your gauss! :angry:`,`C'mon! <@119167263730434048>, stagger your Gauss :cry:`]
        num = Math.floor(Math.random()*3)
        message.channel.send(messageslist[num]);
    }
}