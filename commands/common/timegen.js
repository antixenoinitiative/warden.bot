// const Discord = require("discord.js");
// const { botIdent, eventTimeCreate, hasSpecifiedRole, botLog } = require('../../functions')

// const config = require('../../config.json')

// let date = new Date();
// let diff = Math.round((new Date() - date) / 1000)
// var rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })


// const timeGen = {
//     default: { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
//     shortTime: { hour: '2-digit', minute: '2-digit', hour12: false },
//     longTime: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
//     shortDate: { month: '2-digit', day: '2-digit', year: 'numeric' },
//     longDate: { month: 'numeric', day: '2-digit', year: 'numeric' },
//     shotDateTime: { month: 'numeric', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
//     longDateTime: { weekday: 'short', month: 'numeric', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
//     relativeTime: rtf.format(-diff, 'second')
// }

// // console.log(date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.longDateTime }))

// module.exports = {
//     data: new Discord.SlashCommandBuilder()
//     .setName(`timegen`)
//     .setDescription(`Create a discord timestamp`)
// 	.addStringOption(option => 
//         option.setName('type')
//             .setDescription('Select the timestamp type')
//             .setRequired(true)
//             .addChoices(
//                 {name: `Default: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.default })}`, value: 'a'},
//                 {name: `Short Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.shortTime })}`, value: 't'},
//                 {name: `Long Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.longTime })}`, value: 'T'},
//                 {name: `Short Date: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.shortDate })}`, value: 'd'},
//                 {name: `Long Date: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.longDate })}`, value: 'D'},
//                 {name: `Short Date/Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.shotDateTime })}`, value: 'f'},
//                 {name: `Long Date/Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.longDateTime })}`, value: 'F'},
//                 {name: `Relative Time: ${date.toLocaleString('en-US', { timeZone: 'UTC', ...timeGen.relativeTime })}`, value: 'R'}
//             )
//     ),
//     permissions: 0,
//     async execute(interaction) {
//         await interaction.deferReply({ ephemeral: true })
//         console.log(interaction.locale)
//     }
// }