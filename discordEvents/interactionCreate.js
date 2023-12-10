const { botLog, botIdent } = require('../functions')
const Discord = require('discord.js')
const fs = require('fs')
const path = require('path')
/**
 * Event handlers
 * @author  (Mgram) Marcus Ingram @MgramTheDuck
 */
const exp = {
    interactionCreate: async (interaction,bot) => {
        if (interaction.isCommand()) {
            const command = bot.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
        if (interaction.isButton()) {
            botLog(bot,new Discord.EmbedBuilder().setDescription(`Button triggered by user **${interaction.user.tag}** - Button ID: ${interaction.customId}`),0);
            if (botIdent().activeBot.botName == 'Warden') {
                if (interaction.customId.startsWith("submission")) {
                    interaction.deferUpdate();
                    warden_vars.leaderboardInteraction(interaction);
                    return;
                }
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
        // if (interaction.isButton()) {
        //     
        //     
        //     if (botIdent().activeBot.botName == 'GuardianAI') {
        //         const command = interaction.customId.startsWith(interaction.customId)
        //         if (!command) return;
        //         const slashCommandName = interaction.message.interaction.commandName.split(" ")[0]
        //         const thisFunction = require(`./interactions/${slashCommandName}`) 
        //         await thisFunction(interaction,bot)
                
        //         // console.log(interaction.id)
        //         // console.log(interaction.message.interaction.commandName)
        //         // console.log(interaction.user)
        //         // console.log(interaction.customId)
        //         // console.log(interaction.message.author.username)
        //     }
        // }
    }
}
module.exports = exp