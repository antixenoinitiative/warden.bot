const Discord = require("discord.js");
const { calcMTTOT } = require("./calc/calc");
const weaponData = require("./calc/weapondata.json")

function validateInputCode(inputcode) {
    if(inputcode === "mgauss" || inputcode === "m") {
        inputcode = "mfgc";
    } else if(inputcode === "sgauss" || inputcode === "s") {
        inputcode = "sfgc";
    } else if(inputcode === "modshard" || inputcode === "msc" || inputcode === "ms") {
        inputcode = "mfmsc";
    } else if(inputcode === "modplasma" || inputcode === "mpc" || inputcode === "mp") {
        inputcode = "mfmpc";
    }
    return inputcode;
}

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
            {name: '100%',value: '1'},
            {name: '75%', value: '0.75'},
            {name: '50%', value: '0.5'}
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
            let accuracy = 1;
            if (interaction.options.data.find(arg => arg.name === 'accuracy') != undefined) { accuracy = parseFloat(interaction.options.data.find(arg => arg.name === 'accuracy').value) }
            let target = interaction.options.data.find(arg => arg.name === 'variant').value
            let codes = interaction.options.data.find(arg => arg.name === 'weapon-codes').value.toLowerCase();

            const regex = "([0-9]+|[a-z]+)"
            const tempArray = [...codes.matchAll(regex)];
            const inputArray = [];
            for(let i = 0; i < tempArray.length; i += 2) {
                inputArray.push(tempArray[i][0] + tempArray[i+1][0])
            }
            codes = inputArray.join()

            let weaponCodes = codes.split(",");
            let weapons = []
            for(let i = 0; i < weaponCodes.length; i++) {
                inputcode = weaponCodes[i];
                if (inputcode.match(/^\d/)) {
                    multi = inputcode.charAt(0); // Get Multiplier
                    inputcode = validateInputCode(inputcode.substring(1)); // Remove Multiplier from code
                }
                weapons.push({ number: multi, code: inputcode });
            }

            // Get Data
            results = calcMTTOT(target, weapons, range, accuracy); // [ basic, standard, premium ]

            let weaponNames = []
            for (let i = 0; i < weapons.length; i++) {
                multi = weapons[i].number;
                inputcode = weapons[i].code;
                weaponNames.push("\n" + multi + "x " + weaponData[inputcode].size + " " + weaponData[inputcode].mount + " " + weaponData[inputcode].weapon);
            }

            try {
                const returnEmbed = new Discord.EmbedBuilder()
                .setColor('#FF7100')
                .setTitle("**MTTOT Calculator**")
                .setDescription(`Minimum time on target for **${target}** variant, **${accuracy * 100}%** accuracy, **${range}**m range, using:**${weaponNames}**\n(weapon string: ${weaponCodes})`)
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
