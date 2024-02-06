// const Discord = require("discord.js");
// const {requestInfo} = require('../../../socket/taskManager')

// module.exports = {
//     data: new Discord.SlashCommandBuilder()
//         .setName('roles_req')
//         .setDescription('Select player')
//         .addUserOption(option =>
//             option
//                 .setName('user')
//                 .setDescription('The user you want to check roles on from multiple configured servers.')
//                 .setRequired(true)
//         ),
    
//     permissions: 0,
//     async execute(interaction) {
//         if (process.env.SOCKET_TOKEN) { 
//             try {
//                 const { options } = interaction
//                 let person_asking = interaction.user.id
//                 const subject = options.getUser('user')
//                 const member = guild.members.cache.get(subject.id)
//                 let roles = member.roles.cache.map(role=>role.name)
//                 roles = roles.filter(x=>x != '@everyone')
//                 let rolePackage = { 
//                     type: "roles_request",
//                     user: subject, 
//                     roles: roles,
//                     person_asking: person_asking 
//                 }
//                 requestInfo(rolePackage)
//                 return interaction.reply({ content:`Checking roles of ${rolePackage.user} on other configured servers.`, ephemeral: true })
//             }
//             catch(e) {
//                 console.log(e)
//             }
//         }
//         else {
//             return interaction.reply({ content:`Socket Token not configured. Contact administrator.`, ephemeral: true })
//         }
//     } 
// };