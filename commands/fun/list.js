const Discord = require("discord.js");

module.exports = {
    name: "list",
    description: "Testing List",
    usage: '',
    args: false,
    permlvl: 2, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    async execute (message) {
        const row = new Discord.MessageActionRow()
        .addComponents(
        new Discord.MessageSelectMenu()
            .setCustomId('select')
            .setPlaceholder('Nothing selected')
            .addOptions([
                {
                    label: 'Select me',
                    description: 'This is a description',
                    value: 'first_option',
                },
                {
                    label: 'You can select me too',
                    description: 'This is also a description',
                    value: 'second_option',
                },
            ]),
        );

        await message.reply({ content: 'Test List', components: [row] });
    }
}
        