const { ChunkGraph } = require('webpack');



module.exports = {
    name: "cg",
    description: "Get current community goals",
    usage: '',
    permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    execute (message) {
        const Discord = require('discord.js');
        const https = require('https');

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
				
                for (i=0;i < response.length; i++) {
                    menu.addOptions([
                        {
                            label: `${response[i].objective}`,
                            description: `${response[i].title}`,
                            value: `${response[i].id}`,
                        },
                    ])
                }
                const row = new Discord.MessageActionRow().addComponents(menu);
                message.channel.send({ content: `Please select which Community Goal to view:`, components: [row] })
				
                const filter = i => i.user.id === message.author.id;
                const collector = message.channel.createMessageComponentCollector({ filter, time: 15000 });

                collector.on('collect', async interaction => {
                    if (!interaction.isSelectMenu()) return;
                    for (i=0;i < response.length; i++) {
                        if (interaction.values[0] === response[i].id) {
                            console.log("found");
                            let cg = response[i]
                            interaction.deferUpdate();
                            try {
                                const returnEmbed = new Discord.MessageEmbed()
                                    .setColor('#FF7100')
                                    .setAuthor(`Community Goal - #${cg.id}`, "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                                    .setTitle(`${cg.title}`)
                                    .setDescription(`${cg.bulletin}`)
                                    .addFields(
                                        {name: "Location", value: `${cg.market_name} - ${cg.starsystem_name}`, inline: true},
                                        {name: "Objective", value: `${cg.objective}`, inline: true},
                                        {name: "Progress", value: `${cg.qty}/${cg.target_qty}`, inline: false},
                                        {name: "Expiry", value: `${cg.expiry}`, inline: true},
                                    )
                                interaction.channel.send({ embeds: [returnEmbed.setTimestamp()] });
                            } catch (err) {
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
