const { botLog, botIdent } = require('../functions')
	/**
	 * Event handler for Slash Commands, takes interaction to test before executing command code.
	 * @author  (Mgram) Marcus Ingram @MgramTheDuck
	 */

const exp = {
    interactionCreate: async (interaction,client) => {
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
        // else if (interaction.isSelectMenu()) {
        //     if (interaction.customId == "color-select") {
        //         let colors = "";
        //         await interaction.values.forEach(async value => {
        //             colors += `${value} `
        //         })
        //         await interaction.reply({ content: `Fav color ${colors}`, ephemeral: true})
        //     }
        // }
        if (interaction.isButton()) {
            botLog(new EmbedBuilder().setDescription(`Button triggered by user **${interaction.user.tag}** - Button ID: ${interaction.customId}`),0);
            if (botIdent().activeBot.botName == 'Warden') {
                if (interaction.customId.startsWith("submission")) {
                    interaction.deferUpdate();
                    warden_vars.leaderboardInteraction(interaction);
                    return;
                }
            }
        }
    }
}
module.exports = exp
// module.exports = {
// 	name: 'interactionCreate',
// 	async execute(interaction, client) {
// 		// console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);
        
// 	},
// };