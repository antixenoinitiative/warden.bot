const Discord = require("discord.js");
const ChatGPT = require('chatgpt');

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`question`)
    .setDescription(`Ask the warden something?`)
    .addStringOption(option => option.setName('question')
        .setDescription('The thing you wanna ask')
        .setRequired(true)),
    permissions: 0,
    async execute(interaction) {
        interaction.deferReply()
        if (process.env.CHATGPTKEY) {
            try
            {
                const chatGpt = new ChatGPT(process.env.CHATGPTKEY);
                const message = 'Hello, ChatGPT!';
                chatGpt.send(message).then(response => {
                    console.log(response.data.choices[0].text);
                    interaction.reply({ content: `${response.data.choices[0].text}`})
                  });
            } catch (err) {
                console.log(err);
                interaction.reply({ content: `Sorry, something went wrong!` });
            }
        } else {
            interaction.reply({ content: `Sorry, bot is missing an API key`})
        }
        
    }
}
