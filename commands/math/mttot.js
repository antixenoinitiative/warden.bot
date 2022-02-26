const Discord = require("discord.js");
const { calcMTTOT } = require("./calc/calc");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('mttot')
	.setDescription('Calculate Theoretical Time on Target')
    .addStringOption(option => option.setName('variant')
		.setDescription('Thargoid Variant')
		.setRequired(true)
        .addChoice('Cyclops', 'cyclops')
		.addChoice('Basilisk', 'basilisk')
        .addChoice('Medusa', 'medusa')
        .addChoice('Hydra', 'hydra'))
    .addStringOption(option => option.setName('weapon-codes')
		.setDescription('Use standard codes to assign weapons eg: 2m2s, 1lfaxmc, 2sfgc')
		.setRequired(true))
    .addStringOption(option => option.setName('accuracy')
		.setDescription('Accuracy Rating')
		.setRequired(true)
        .addChoice('100%', '100')
		.addChoice('75%', '75')
        .addChoice('50%', '50'))
    .addIntegerOption(option => option.setName('range')
		.setDescription('Range in Meters')
		.setRequired(false)),
	permissions: 0,
	async execute(interaction) {
        let result;
		try {
            let range = 1500
            let accuracy = interaction.options.data.find(arg => arg.name === 'accuracy').value
            if (interaction.options.data.find(arg => arg.name === 'range') != undefined) { range = interaction.options.data.find(arg => arg.name === 'range').value }
            let target = interaction.options.data.find(arg => arg.name === 'variant').value
            let codes = interaction.options.data.find(arg => arg.name === 'weapon-codes').value.toLowerCase();

            const regex = "([0-9]+|[a-z]+)"
            const tempArray = [...codes.matchAll(regex)];
            const inputArray = [];
            for(let i = 0; i < tempArray.length; i += 2) {
                inputArray.push(tempArray[i][0] + tempArray[i+1][0])
            }
            codes = inputArray.join()

            let weapons = codes.split(",");

            target = target.toLowerCase();

            // Get Data
            result = calcMTTOT(target, weapons, range); // [ basic100, std100, prem100, basic75, std75, prem75, basic50, std50, prem50 ]

            let results = []
            switch (accuracy) {
                case "100":
                    results = [result[0],result[1],result[2]]
                    break;
                case "75":
                    results = [result[3],result[4],result[5]]
                    break;
                case "50":
                    results = [result[6],result[7],result[8]]
                    break;        
            }

            try {
                const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
                .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                .setTitle("**MTTOT Calculator**")
                .setDescription(`**${accuracy}%** Accuracy Results for Variant: **${target}**, Weapons: **${weapons}**, Range: **${range}**`)
                .addField("Basic",`${results[0]}`,true)
                .addField("Standard",`${results[1]}`,true)
                .addField("Premium",`${results[2]}`,true)
                interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
            } catch (err) {
                interaction.reply({ content: "Something went wrong, please ensure you have entered the correct format" });
            }
		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format, type `/codes` to get a list of weapon codes." })
		}        
	},
};
