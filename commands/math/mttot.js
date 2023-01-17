const Discord = require("discord.js");
const { calcMTTOT } = require("./calc/calc");
const weaponData = require("./calc/weapondata.json")


module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('mttot')
	.setDescription('Calculate Theoretical Time on Target')
    .addStringOption(option => option.setName('variant')
		.setDescription('Thargoid Variant')
		.setRequired(true)
		.addChoices(
			{ name:'Cyclops', value:'cyclops' },
			{ name:'Basilisk', value:'basilisk' },
			{ name:'Medusa', value:'medusa' },
			{ name:'Hydra', value:'hydra' }
		))
    .addStringOption(option => option.setName('weapon-codes')
		.setDescription('Use standard codes to assign weapons eg: 2m2s, 1lfaxmc, 2sfgc')
		.setRequired(true))
    .addStringOption(option => option.setName('accuracy')
		.setDescription('Accuracy Rating')
		.setRequired(false)
        .addChoices(
            {name: '100%',value:'100'},
            {name: '75%', value:'75'},
            {name: '50%', value:'50'}
        ))
    .addIntegerOption(option => option.setName('range')
		.setDescription('Range in Meters')
		.setRequired(false)),
	permissions: 0,
	async execute(interaction) {
        let result;
		try {
            let range = 1500
            if (interaction.options.data.find(arg => arg.name === 'range') != undefined) { range = interaction.options.data.find(arg => arg.name === 'range').value }
            let accuracy = '100'
            if (interaction.options.data.find(arg => arg.name === 'accuracy') != undefined) { accuracy = interaction.options.data.find(arg => arg.name === 'accuracy').value }
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

            let weaponNames = []
            for (let i = 0; i < weapons.length; i++) {
                inputcode = weapons[i];
                if (inputcode.match(/^\d/)) {
                    multi = inputcode.charAt(0); // Get Multiplier
                    inputcode = inputcode.substring(1); // Remove Multiplier from code
                }
                switch (inputcode) {
                    case "mgauss":
                        inputcode = "mfgc";
                        break;
                    case "sgauss":
                        inputcode = "sfgc";
                        break;
                    case "mfgauss":
                        inputcode = "mfgc";
                        break;
                    case "sfgauss":
                        inputcode = "sfgc";
                        break;
                    case "m":
                        inputcode = "mfgc";
                        break;
                    case "s":
                        inputcode = "sfgc";
                        break;
                }
                weaponNames.push("\n" + multi + "x " + weaponData[inputcode].type + " " + weaponData[inputcode].weapon + ", class " + weaponData[inputcode].size);
            }


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
                const returnEmbed = new Discord.EmbedBuilder()
                .setColor('#FF7100')
                .setTitle("**MTTOT Calculator**")
                .setDescription(`Minimum time on target for **${target}** variant, **${accuracy}%** accuracy, **${range}**m range, using:**${weaponNames}**\n(weapon string: ${weapons})`)
                // .setDescription(`**${accuracy}%** Accuracy Results for Variant: **${target}**, Range: **${range}**, Weapons: **${weaponNames}**`)
                .addFields({ name: "Basic", value: `${results[0]}`, inline: true })
                .addFields({ name: "Standard", value: `${results[1]}`, inline: true })
                .addFields({ name: "Premium", value: `${results[2]}`, inline: true })
                interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
            } catch (err) {
                interaction.reply({ content: "Something went wrong, please you entered the correct format" });
            }
		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format, type `/codes` to get a list of weapon codes." })
		}        
	},
};
