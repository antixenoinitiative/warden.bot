const Discord = require("discord.js");

module.exports = {
    name: 'nhss',
    description: 'All you need to know about Non-Human Signal Sources',
    permlvl: 0,
    format: '',
    restricted: false,
    execute(message, args) {
	const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle("**NHSS Types**") 
		.addField("You can semi consistently determine NHSS contents based on their threat rating:", "Threat 3: 2 Scouts + 0-3 Human ships\nThreat 4: 4-7 Scouts + 0-3 Human ships\nThreat 5: 1 Cyclops OR 4-8 Scouts\nThreat 6: 1 Basilisk OR 1 Cyclops + 4 Scouts OR 12 Scouts\nThreat 7: 1 Medusa OR 1 Basilisk + 4 Scouts\nThreat 8: 1 Hydra OR 1 Medusa + 4 Scouts\nThreat 9: 1 Hydra + 4 Scouts")
		.addField("**NOTE:** If a Nonhuman Signal Source has a Salvage Icon (cylinder) in the navigation panel, it will always be a solo Thargoid Interceptor.", "[*Click here for more info*](https://wiki.antixenoinitiative.com/en/nhss)")
		.addField("Always get interceptors using Full Spectrum System (FSS) Scanner:", "When using the FSS, you are able to filter which kind of instance you will get based on where you put your tuner, shown in the picutre below:")
		.setImage("https://cdn.discordapp.com/attachments/860453324959645726/872241770614882334/SignalSourcesBoth.png")
	message.channel.send(returnEmbed.setTimestamp());
    }
};
