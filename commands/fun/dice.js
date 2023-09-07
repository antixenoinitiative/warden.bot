const Discord = require("discord.js");
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`dice`)
    .setDescription(`Dice simulator (D&D style).`)
    .addStringOption(option => option.setName('dicestring')
        .setDescription('The string to simulate (1d6 = one throw of a 6 sided dice).')
        .setRequired(true)),
    permissions: 0,
    async execute (interaction) {
        diceNumber = 0;
        diceSides = 0;
        const unparsedString = interaction.options.data.find(arg => arg.name === 'dicestring').value;
        vars = unparsedString.split('d');
        diceNumber = vars[0];
        diceSides = vars[1];
        if(isNaN(parseInt(diceNumber)) || isNaN(parseInt(diceSides)) || diceNumber === 0 || diceSides === 0 || diceNumber > 1000000 || diceSides > 1000000)
        {
            await interaction.reply({content: `Incorrect input string format or parameters too high (max 1 million for both)`, ephemeral: true});
            return;
        }
        result = 0;
        for(i = 0; i < diceNumber; i++)
        {
            result += getRandomInt(diceSides) + 1;
        }
        await interaction.reply({content: `${interaction.member} rolled ${diceNumber} dice, each one with ${diceSides} sides, the result is **${result}**`});
    }
}
function getRandomInt(max)
{
    return Math.floor(Math.random() * max);
}

