const Discord = require("discord.js");
const { calcMTTOT } = require("../mttot");

module.exports = {
	name: 'mttot',
	description: 'Calculate Theoretical Time on Target',
    format: '"variant" "weapon codes" "range"',
	permlvl: 0,
	restricted: false,
	execute(message, args) {
		if (args == "") { 
            const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
				.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
				.setTitle("**MTTOT Calculator**")
				.setDescription('To use the MTTOT Calculator, format `-mttot "medusa" "1mfaxmc,2sfgc" "1500"`. For multiple weapons of the same type, include a multiplyer eg: `2` before the weapon code. Weapon format examples below:')
                returnEmbed.addField("2 Medium + 2 Small Gauss",`2m,2s`)
                returnEmbed.addField("2x Size 3 Turret AXMC",`2ltaxmc`)
                returnEmbed.addField("4x Size 3 Fixed AXMR",`4lfaxmr`)
                returnEmbed.addField("Size 1 Fixed Plasma Charger",`sfpc`)
                returnEmbed.addField("Size 2 Fixed Shard Cannon",`mfsc`)
                returnEmbed.addField("3x Size 2 Fixed Gauss Cannon",`3mfgc`)
                returnEmbed.setFooter("https://wiki.antixenoinitiative.com/en/min-tot-calculator")
				message.channel.send(returnEmbed.setTimestamp()) 
            return; 
        }
		try {

            // Format Input
			let target = args[0];
            let codes = args[1];
            let range = args[2];
            let weapons = codes.split(",");

            target = target.toLowerCase();

            message.channel.send(`Calculating - Target: **${target}** Weapon Codes: **${weapons}** Range: **${range}**`);

            // Get Data
            let result = calcMTTOT(target, weapons, range);

            // Send Embed
            const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
				.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
				.setTitle("**MTTOT Calculator**")
				.setDescription(`Results for Variant: **${target}**, Weapons: **${weapons}**, Range: **${range}**`)
                returnEmbed.addField("Basic 100%",`${result.basic}`,true)
                returnEmbed.addField("Standard 100%",`${result.standard}`,true)
                returnEmbed.addField("Premium 100%",`${result.premium}`,true)
                returnEmbed.addField("Basic 75%",`${result.basic75}`,true)
                returnEmbed.addField("Standard 75%",`${result.standard75}`,true)
                returnEmbed.addField("Premium 75%",`${result.premium75}`,true)
                returnEmbed.addField("Basic 50%",`${result.basic50}`,true)
                returnEmbed.addField("Standard 50%",`${result.standard50}`,true)
                returnEmbed.addField("Premium 50%",`${result.premium50}`,true)
                returnEmbed.setFooter("https://wiki.antixenoinitiative.com/en/min-tot-calculator")
				message.channel.send(returnEmbed.setTimestamp())

		} catch (err) {
            console.log(err)
			message.channel.send("Something went wrong, please you entered the correct format")
		}
	},
};