const Discord = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`ranksubmissions`)
    .setDescription(`How to submit for ranks`)
    .setDefaultPermission(false),
    async execute (interaction) {
        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setTitle("**How to Submit for Ranks**")
		.setImage('https://axicdn.s3.us-east-1.amazonaws.com/images/km2_explosion.png')
		.setAuthor({ name: 'Anti-Xeno Initiative', iconURL: 'https://axicdn.s3.us-east-1.amazonaws.com/images/AXI_Insignia_Hypen_128.png', url: 'https://antixenoinitiative.com' })
		.setDescription(`Once you have your evidence, either a screenshot or a video, you can post it in the #tea-and-medals channels, where it will be reviewed by staff.

**We ask you do not ping anyone to review your submission, it will be processed when possible.** If your submission was not processed within 48 hours, you are allowed to contact a staff member about it.

The proof has to be a **screenshot**, or a **video** (in some cases we may require a video), and has to clearly show the interceptor death explosion, the "bond received" message and other parts of ship UI such as the Ship Health and Radar.

For more information, please visit the AXI ranks page on our website: https://antixenoinitiative.com/ranks`)
        

        interaction.channel.send({ embeds: [returnEmbed] });
    }
}
