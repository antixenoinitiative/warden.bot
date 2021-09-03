const moment = require("moment");
const db = require("../../db/index");
const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`newevent`)
    .setDescription(`Create a new event`)
    .addStringOption(option => option.setName('name')
		.setDescription('Name of the Event')
		.setRequired(true))
    .addStringOption(option => option.setName('description')
		.setDescription('Short description of the event')
		.setRequired(true))
    .addStringOption(option => option.setName('time')
		.setDescription('DD-MM-YYYY hh:mm')
		.setRequired(true))
    .setDefaultPermission(false),
    permissions: 1,
    async execute (interaction) {
        let eventName = interaction.options.data.find(arg => arg.name === 'name').value
        let eventDesc = interaction.options.data.find(arg => arg.name === 'description').value
        let eventTime;
        let formats = [ "YYYY-MM-DD hh:mm", "DD-MM-YYYY hh:mm", "DD/MM/YYYY hh:mm" ];
        if (moment(interaction.options.data.find(arg => arg.name === 'time').value,formats).isValid()) {
            eventTime = moment(interaction.options.data.find(arg => arg.name === 'time').value.value,formats);
        }

        const getRandomString = (length) => {
            var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            var result = '';
            for ( var i = 0; i < length; i++ ) {
                result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
            }
            return result;
        }

        let eventKey = getRandomString(10);

        const eventEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor(`The Anti-Xeno Initiative`, "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle(`${eventName}`)
		.setDescription(`${eventDesc}\n\n Event Date: ${eventTime.format()}`)

        const row = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setCustomId(`event-${eventKey}-enroll`).setLabel('Sign Up').setStyle('SUCCESS'),)
        .addComponents(new Discord.MessageButton().setCustomId(`event-${eventKey}-leave`).setLabel('Leave').setStyle('DANGER'),)

        let embed;
        if (process.env.EVENTCHANNELID !== undefined) {
            embed = interaction.guild.channels.cache.find(x => x.id === process.env.EVENTCHANNELID).send({ embeds: [eventEmbed], components: [row] })
        } else {
            console.warn("The environment variable EVENTCHANNELID is not defined.") 
        }

        try {
            await db.query("INSERT INTO events(event_id, embed, name, description, creator, date) VALUES($1, $2, $3, $4, $5, $6)", [eventKey, embed, eventName, eventDesc, interaction.member.id, eventTime]);
            interaction.reply({ content: `Event Created Successfully, ID: ${eventKey}`});
        } catch (err) {
            interaction.reply({ content: `Something went wrong saving the event, please try again or contact staff`});
            console.log(err);
        }
    }
}
