const Discord = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: process.env.CHATGPTKEY,
});
const openai = new OpenAIApi(configuration);
module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`question++`)
    .setDescription(`Ask the warden something?, WARNING: good advice not guaranteed.`)
    .addStringOption(option => option.setName('question')
        .setDescription('The thing you wanna ask')
        .setRequired(true))
    .addIntegerOption(option => option.setName('temperature')
        .setDescription('Set the Temperature, between 0-1, eg: 0.3')
        .setRequired(true))
    .addIntegerOption(option => option.setName('max_tokens')
        .setDescription('Set the maximum number of tokens to use, 0-2048')
        .setRequired(true)),
    permissions: 0,
    async execute(interaction) {
        interaction.deferReply()
        if (process.env.CHATGPTKEY) {
            console.log(interaction)
            try
            {
                const completion = await openai.createCompletion({
                    model: "text-davinci-002",
                    prompt: interaction.options.data.find(arg => arg.name === 'question').value,
                    max_tokens: interaction.options.data.find(arg => arg.name === 'max_tokens').value,
                    temperature: interaction.options.data.find(arg => arg.name === 'temperature').value,
                    frequency_penalty: 1,
                    presence_penalty: 0.5,
                });
                interaction.editReply({ content: `${interaction.member} asked` + "`" + ` "${interaction.options.data.find(arg => arg.name === 'question').value}" ` + '`' + `${completion.data.choices[0].text}`})
            } catch (err) {
                console.log(err);
                interaction.reply({ content: `Sorry, something went wrong!` });
            }
        } else {
            interaction.reply({ content: `Sorry, bot is missing an API key`})
        }
        
    }
}
