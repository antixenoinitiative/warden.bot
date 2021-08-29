const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('lfw')
	.setDescription('Gives you a role pingable by others if you are looking for group')
    .addStringOption(option => option.setName('platform')
		.setDescription('Select which platform you want to find a wing on.')
		.setRequired(false)
        .addChoice('PC', 'pc')
		.addChoice('Playstation', 'ps')
		.addChoice('XBox', 'xb')),
    permlvl: 0,
    async execute(interaction) {
        let member = interaction.member._roles;
        let platCount = 0;
        const id = {
            "pc": "428260067901571073",
            "xb": "533774176478035991",
            "ps": "428259777206812682",
            "pclfw": "602937807991865383",
            "pslfw": "602939344143122557",
            "xblfw": "602939699685752833"
        }

        // let allowedChannels = [ "380247203794518027", "380467558110855173", "380467652696735744" ]
        
        // if (!allowedChannels.includes(interaction.channelId)) { return }

        function announce(newPlatform) {
            let lfwString = ""
            member = interaction.member._roles
            member.push(newPlatform)
            if (member.includes(id.pclfw)) { lfwString += `<@&${id.pclfw}>`; }
            if (member.includes(id.pslfw)) { lfwString += `<@&${id.pslfw}>`; }
            if (member.includes(id.xblfw)) { lfwString += `<@&${id.xblfw}>`; }
            interaction.reply({ content: `<@${interaction.member.id}> is now ${lfwString}`})
        }
        
        if (interaction.options.data.find(arg => arg.name === 'platform') === undefined) {
            if (member.includes(id.pclfw) || member.includes(id.pslfw) || member.includes(id.xblfw)) {
                interaction.member.roles.remove(id.pclfw)
                interaction.member.roles.remove(id.pslfw)
                interaction.member.roles.remove(id.xblfw)
                interaction.reply({ content: `<@${interaction.member.id}> is no longer looking for Wing` });
                return;
            }
        }

        if (interaction.options.data.find(arg => arg.name === 'platform') === undefined) {
            for (let role of member) {
                if (role === id.pc) { platCount++; }
                if (role === id.ps) { platCount++; }
                if (role === id.xb) { platCount++; }
            }
            if (platCount != 1) {
                return interaction.reply({ content: "Please specify a platform: `pc/ps/xb`" });
            }

            for (let role of member) {
                switch (role) {
                    case id.pc:
                        await interaction.member.roles.add(id.pclfw)
                        announce(id.pclfw)
                        break;
                    case id.ps:
                        await interaction.member.roles.add(id.pslfw)
                        announce(id.pslfw)
                        break;
                    case id.xb:
                        await interaction.member.roles.add(id.xblfw)
                        announce(id.xblfw)
                        break;
                }
            }
            return;
        }

        switch (interaction.options.data.find(arg => arg.name === 'platform').value) {
            case "pc":
                await interaction.member.roles.add(id.pclfw)
                announce(id.pclfw)
                break;
            case "ps":
                await interaction.member.roles.add(id.pslfw)
                announce(id.pslfw)
                break;
            case "xb":
                await interaction.member.roles.add(id.xblfw)
                announce(id.xblfw)
                break;
        }
    }
}

