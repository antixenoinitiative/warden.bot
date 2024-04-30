const Discord = require("discord.js");
const { eventTimeValidate } = require('../../functions')

const config = require('../../config.json')

let date = new Date();
let diff = Math.round((new Date() - date) / 1000)
var rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// const timestamp = eventTimeValidate("30/Apr 10:30",-6);
// console.log(timestamp);

const timeGen = {
    default: { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
    shortTime: { hour: '2-digit', minute: '2-digit', hour12: false },
    longTime: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
    shortDate: { month: '2-digit', day: '2-digit', year: 'numeric' },
    longDate: { month: 'numeric', day: '2-digit', year: 'numeric' },
    shotDateTime: { month: 'numeric', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
    longDateTime: { weekday: 'short', month: 'numeric', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
    relativeTime: rtf.format(-diff, 'second')
}

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`timegen`)
    .setDescription(`Create a discord timestamp`)
	.addStringOption(option => 
        option.setName('type')
            .setDescription('Select the timestamp type')
            .setRequired(true)
            .addChoices(
                {name: `Default: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.default })}`, value: 'a'},
                {name: `Short Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.shortTime })}`, value: 't'},
                {name: `Long Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.longTime })}`, value: 'T'},
                {name: `Short Date: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.shortDate })}`, value: 'd'},
                {name: `Long Date: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.longDate })}`, value: 'D'},
                {name: `Short Date/Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.shotDateTime })}`, value: 'f'},
                {name: `Long Date/Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.longDateTime })}`, value: 'F'},
                {name: `Relative Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.relativeTime })}`, value: 'R'}
            )
        )
    .addNumberOption(option => 
        option.setName('timezone')
            .setDescription('Enter your current timezone: Example: 0,-5,+2')
            .setRequired(true)
    )
    .addStringOption(option => 
        option.setName('datetime')
            .setDescription('Enter the date-time in your local time in this format only: 15/Jan 15:30')
            .setRequired(true)
    )
    ,
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true })
        let inputs = interaction.options._hoistedOptions
        let timeFormat = inputs.find(i => i.name === 'type').value
        let timeValue = inputs.find(i => i.name === 'datetime').value
        let timeZone = inputs.find(i => i.name === 'timezone').value
        const timestamp = eventTimeValidate(timeValue,timeZone,interaction)
        const time = timeFormat == 'a' ? `<t:${timestamp}>` : `<t:${timestamp}:${timeFormat}>`
        const time_unformatted = timeFormat == 'a' ? '```<t:' + timestamp + '>```' : '```<t:' + timestamp + ':' + timeFormat + '>```';
        const embed = new  Discord.EmbedBuilder()
            .setTitle('Custom Time')
            .setDescription('Created a discord timestamp from your chosen local time inputed.')
            .addFields(
                {name: 'Your local time input:', value: timeValue, inline: true},
                {name: 'Your local time visual', value: time, inline: true},
                {name: 'Code to paste somewhere', value: time_unformatted, inline: false},
            )
        // await interaction.guild.channels.cache.find(c => c.id === interaction.channelId).send(`${time}`)
        await interaction.editReply({ content: `Action Complete`, embeds:[embed], ephemeral: true });
    }
}