const Discord = require("discord.js");
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`pyro`)
    .setDescription(`Summons the mythical Fire Chicken`),
    permissions: 0,
    execute (interaction) {
        let links = ["https://tenor.com/view/phoenix-fantastic-beasts-fantastic-beasts-crimes-of-grindelwald-firebird-gif-15290335.gif", "https://tenor.com/view/birb-redbirb-redbird-gif-22487414.gif", "https://tenor.com/view/bird-cute-fire-flames-burning-gif-17664259.gif", "https://tenor.com/view/big-bird-angry-door-fall-gif-11404358.gif"];
        let randomIndex = getRandomInt(links.length);
        interaction.reply({ content: `<@86435015272960000> rises from the ashes... You summon the mythical Fire Chicken!`, files:[links[randomIndex]] });
    }
}
function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}
