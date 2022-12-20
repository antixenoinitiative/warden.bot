const Discord = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: process.env.CHATGPTKEY,
});

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
        interaction.deferReply()
        if (process.env.CHATGPTKEY) {
            try
            {

                // Fetches a response from chatGPT API
                const completion = await openai.createCompletion({
                    model: "text-curie-001",
                    prompt: `${interaction.member.displayName}:${interaction.options.data.find(arg => arg.name === 'question').value}\nWarden:`,
                    max_tokens: 500,
                    temperature: 0.5,
                    frequency_penalty: 1,
                    presence_penalty: 0.5,
                    stop: `${interaction.member.displayName}:`
                });
                
                // Writes response
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
