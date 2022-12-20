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
                const completion = await openai.createCompletion({
                    model: "text-davinci-002",
                    prompt: `You are an assistant bot in the Anti-Xeno Initiative Discord Server. 
                    ${interaction.member}: ${interaction.options.data.find(arg => arg.name === 'question').value}
                    Warden: `,
                    max_tokens: 150,
                    temperature: 0.4,
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
