const Discord = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");
const fs = require('fs');

const configuration = new Configuration({
    apiKey: process.env.CHATGPTKEY,
});

const fileName = 'memories.txt';

const openai = new OpenAIApi(configuration);
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`question`)
    .setDescription(`Ask the warden something?, WARNING: good advice not guaranteed.`)
    .addStringOption(option => option.setName('question')
        .setDescription('The thing you wanna ask')
        .setRequired(true)),
    permissions: 0,
    async execute(interaction) {
        if (process.env.CHATGPTKEY) {
            try
            {
                // Writes the prompt to the memory file
                await fs.appendFileSync(fileName, `${interaction.member.displayName}:${interaction.options.data.find(arg => arg.name === 'question').value}\n`)
                let memories = await fs.readFileSync(fileName)
                let recentMemories = memories.toString().slice(-1000)

                // Fetches a response from chatGPT API
                const completion = await openai.createCompletion({
                    model: "text-davinci-002",
                    prompt: `${recentMemories}\nWarden:`,
                    max_tokens: 150,
                    temperature: 0.4,
                    frequency_penalty: 1,
                    presence_penalty: 0.5,
                    stop: `${interaction.member.displayName}:`
                });
                
                // Writes response to memories
                await fs.appendFileSync(fileName, `Warden:${completion.data.choices[0].text}\n`);
                interaction.reply({ content: `${interaction.member} asked` + "`" + ` "${interaction.options.data.find(arg => arg.name === 'question').value}" ` + '`' + `\n${completion.data.choices[0].text}`})
            
            } catch (err) {
                console.log(err);
                interaction.reply({ content: `Sorry, something went wrong!` });
            }
        } else {
            interaction.reply({ content: `Sorry, bot is missing an API key`})
        }
        
    }
}
