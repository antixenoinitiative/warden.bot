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
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions:0,
    async execute(interaction) {
        interaction.deferReply()
        if (process.env.CHATGPTKEY) {
            try
            {

                // Fetches a response from chatGPT API
                const completion = await openai.createCompletion({
                    model: "text-curie-001",
                    prompt: `${interaction.options.data.find(arg => arg.name === 'question').value}`,
                    max_tokens: 256,
                    temperature: 1,
                    frequency_penalty: 1,
                    presence_penalty: 0.5,
                    stop: `${interaction.member.displayName}:`
                });
                
                // Writes response
                interaction.editReply({ content: `${interaction.member} asked` + "`" + ` "${interaction.options.data.find(arg => arg.name === 'question').value}" ` + '`' + `${completion.data.choices[0].text}`})
            
            } catch (err) {
                console.log(err);
                interaction.editReply({ content: `Sorry, something went wrong!`, ephemeral: true });
            }
        } else {
            interaction.reply({ content: `Sorry, bot is missing an API key`})
        }
        
    }
}
