const { botLog, botIdent } = require('../functions')
const Discord = require('discord.js')
const fs = require('fs')
const path = require('path')

const exp = {
    interactionCreate: async (interaction,bot) => {
        //!isModalSubmit() is not 100% required, you can gather any modal replies from within the codebase your working from.
        //!Enabling this will cause issues with the Opord modals as they are initiated from a button response and do not contain
        //!   the interaction.commandName pathing. It is dealt with from the client code itself.
        // if (interaction.isModalSubmit()) {
        //     const command = interaction.client.commands.get(interaction.commandName);
           
        //     if (!command) return;

        //     try {
        //         await command.execute(interaction);
        //     } catch (error) {
        //         console.error(error);
        //         await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        //     }
        // }
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName)

            if (!command) return console.log('Command not found')
            if (!command.autocomplete) {
                return console.error(`No autocomplete handler was found for the ${interaction.commandName} command.`,
                );
            }
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
        }
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
            // if (botIdent().activeBot.botName != 'GuardianAI') {
            //     botLog(bot,new Discord.EmbedBuilder().setDescription(`Button triggered by user **${interaction.user.tag}** - Button ID: ${interaction.customId}`),0);
            // }
            if (botIdent().activeBot.botName == 'Warden2') {
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