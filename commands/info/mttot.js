const Discord = require("discord.js");
const { calcMTTOT } = require("../../mttot");

module.exports = {
	name: 'mttot',
	description: 'Calculate Theoretical Time on Target',
  usage: '"variant" "weapon codes" "range"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	execute(message, args) {
		if (args == "") {
            const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
				.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
				.setTitle("**MTTOT Calculator**")
				.setDescription('To use the MTTOT Calculator, format `-mttot "medusa" "1mfaxmc,2sfgc" "1500"`. For multiple weapons of the same type, include a multiplyer eg: `2` before the weapon code. Weapon format examples below:')
                .addField("Weapon Code Example #1",`2 Medium + 2 Small Gauss = 2m,2s`)
                .addField("Weapon Code Example #2",`2x Size 3 Turret AXMC = 2ltaxmc`)
                .addField("Calculator Web App",`https://th3-hero.github.io/AX-MTToT-Calculator/`)
				message.channel.send({ embeds: [returnEmbed.setTimestamp()] })
            return;
        }

        let result;
		try {

            // Format Input
			let target = args[0];
            let codes = args[1];
            let range = args[2];
            let weapons = codes.split(",");

            target = target.toLowerCase();

            message.channel.send(`Calculating - Target: **${target}** Weapon Codes: **${weapons}** Range: **${range}**`);

            // Get Data
            result = calcMTTOT(target, weapons, range);

            // Build the initial message
            const row = new Discord.MessageActionRow()
            .addComponents(new Discord.MessageButton().setCustomId('mttot100').setLabel('100%').setStyle('PRIMARY'),)
            .addComponents(new Discord.MessageButton().setCustomId('mttot75').setLabel('75%').setStyle('PRIMARY'),)
            .addComponents(new Discord.MessageButton().setCustomId('mttot50').setLabel('50%').setStyle('PRIMARY'),)
            message.channel.send({ content: "Please select accuracy rating:", components: [row] });

            // Recieve the button response
            const filter = i => i.user.id === message.author.id;
            const collector = message.channel.createMessageComponentCollector({ filter, time: 15000 });
            collector.on('collect', async i => {
                if (i.customId === 'mttot100') {
                    i.deferUpdate();
                    try {
                        const returnEmbed = new Discord.MessageEmbed()
                        .setColor('#FF7100')
                        .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                        .setTitle("**MTTOT Calculator**")
                        .setDescription(`**100%** Accuracy Results for Variant: **${target}**, Weapons: **${weapons}**, Range: **${range}**`)
                        .addField("Basic",`${result.basic}`,true)
                        .addField("Standard",`${result.standard}`,true)
                        .addField("Premium",`${result.premium}`,true)
                        i.channel.send({ embeds: [returnEmbed.setTimestamp()] });
                    } catch (err) {
                        i.channel.send({ content: "Something went wrong, please you entered the correct format" });
                    }
                }
                if (i.customId === 'mttot75') {
                    i.deferUpdate();
                    try {
                        const returnEmbed = new Discord.MessageEmbed()
                        .setColor('#FF7100')
                        .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                        .setTitle("**MTTOT Calculator**")
                        .setDescription(`**75%** Accuracy Results for Variant: **${target}**, Weapons: **${weapons}**, Range: **${range}**`)
                        .addField("Basic",`${result.basic75}`,true)
                        .addField("Standard",`${result.standard75}`,true)
                        .addField("Premium",`${result.premium75}`,true)
                        i.channel.send({ embeds: [returnEmbed.setTimestamp()] });
                    } catch (err) {
                        i.channel.send({ content: "Something went wrong, please you entered the correct format" });
                    }
                }
                if (i.customId === 'mttot50') {
                    i.deferUpdate();
                    try {
                        const returnEmbed = new Discord.MessageEmbed()
                        .setColor('#FF7100')
                        .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                        .setTitle("**MTTOT Calculator**")
                        .setDescription(`**50%** Accuracy Results for Variant: **${target}**, Weapons: **${weapons}**, Range: **${range}**`)
                        .addField("Basic",`${result.basic50}`,true)
                        .addField("Standard",`${result.standard50}`,true)
                        .addField("Premium",`${result.premium50}`,true)
                        i.channel.send({ embeds: [returnEmbed.setTimestamp()] });
                    } catch (err) {
                        i.channel.send({ content: "Something went wrong, please you entered the correct format" });
                    }
                }
		    });

		    collector.on('end', collected => console.log(`Collected ${collected.size} items`));

		} catch (err) {
            console.log(err)
			message.channel.send({ content: "Something went wrong, please you entered the correct format" })
		}

        
	},
};
