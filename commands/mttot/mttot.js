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
    usage: '"variant" "weapon codes" "range"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	async execute(message) {
		let args = []
        for (let data of message.options.data) {
            args.push(data.value)
        }
        if (args == []) {
            const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
				.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
				.setTitle("**MTTOT Calculator**")
				.setDescription('To use the MTTOT Calculator, format `-mttot "medusa" "1mfaxmc,2sfgc" "1500"`. For multiple weapons of the same type, include a multiplyer eg: `2` before the weapon code. Weapon format examples below:')
                .addField("Weapon Code Example #1",`2 Medium + 2 Small Gauss = 2m,2s`)
                .addField("Weapon Code Example #2",`2x Size 3 Turret AXMC = 2ltaxmc`)
                .addField("Calculator Web App",`https://th3-hero.github.io/AX-MTToT-Calculator/`)
				message.reply({ embeds: [returnEmbed.setTimestamp()] })
            return;
        }
        let result;
		try {
            const accuracy = args[2]
            // Format Input
            let range = 1500
            if (args[3] != undefined) { range = args[3] }
            let [ target, codes ] = args

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
                message.reply({ embeds: [returnEmbed.setTimestamp()] });
            } catch (err) {
                message.reply({ content: "Something went wrong, please you entered the correct format" });
            }
		} catch (err) {
            console.log(err)
			message.channel.send({ content: "Something went wrong, please you entered the correct format" })
		}        
	},
};
