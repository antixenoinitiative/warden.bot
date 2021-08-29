const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('cg')
	.setDescription('Get current CG info'),
    permlvl: 0,
    async execute (message) {
        const Discord = require('discord.js');
        const https = require('https');
        message.reply(`Fetching CG Data 📰`)

        const options = {
            hostname: 'api.orerve.net',
            port: 443,
            path: '/2.0/website/initiatives/list?lang=en',
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        }

        const req = https.request(options, res => {
            console.log(`statusCode: ${res.statusCode}`)

            res.on('data', d => {
                let response = JSON.parse(d).activeInitiatives; //prints inara's output to the node console, process it further here
                
                const menu = new Discord.MessageSelectMenu().setCustomId('select').setPlaceholder('Nothing selected')
				
                for (let data of response) {
                    menu.addOptions([
                        {
                            label: `${data.objective}`,
                            description: `${data.title}`,
                            value: `${data.id}`,
                        },
                    ])
                }
                const row = new Discord.MessageActionRow().addComponents(menu);
                message.channel.send({ content: `Please select which Community Goal to view:`, components: [row] }).catch(message.channel.send({ content: `CG data unavailable 🛑`}))
                
                const filter = i => i.user.id === message.member.id;
                const collector = message.channel.createMessageComponentCollector({ filter, time: 15000 });

                collector.on('collect', async interaction => {
                    if (!interaction.isSelectMenu()) return;
                    for (let data of response) {
                        if (interaction.values[0] === data.id) {
                            console.log("found");
                            interaction.deferUpdate();
                            try {
                                const returnEmbed = new Discord.MessageEmbed()
                                    .setColor('#FF7100')
                                    .setAuthor(`Community Goal - #${data.id}`, "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                                    .setTitle(`${data.title}`)
                                    .setDescription(`${data.bulletin}`)
                                    .addFields(
                                        {name: "Location", value: `${data.market_name} - ${data.starsystem_name}`, inline: true},
                                        {name: "Objective", value: `${data.objective}`, inline: true},
                                        {name: "Progress", value: `${data.qty}/${data.target_qty}`, inline: false},
                                        {name: "Expiry", value: `${data.expiry}`, inline: true},
                                    )
                                interaction.channel.send({ embeds: [returnEmbed.setTimestamp()] });
                            } catch (err) {
                                console.error(err);
                                interaction.channel.send({ content: `Something went wrong. Error: ${err}` });
                            }
                        }
                    }
                });
            })
        })

        req.on('error', error => {
            console.error(error)
        })

        req.end()
    }
}
