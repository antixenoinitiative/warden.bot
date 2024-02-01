const Discord = require("discord.js");
const {requestInfo} = require('../../../socket/taskManager')
const config = require('../../../config.json')

let voiceChans = []
function fillVoiceChan(interaction) {
    const guild = interaction.client.guilds.cache.get(process.env.GUILDID);
    const voiceChansSet = new Set();

    if (guild) {
        const voiceChannels = guild.channels.cache.filter(chan => chan.type === 2); 

        voiceChannels.forEach(channel => {
            voiceChansSet.add({ name: channel.name, id: channel.id });
        });
    }
    voiceChans = Array.from(voiceChansSet); 
}
module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('roles_req')
        .setDescription('select player')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user you want to hug')
                .setRequired(true)
        ),
    
    permissions: 0,
    async execute(interaction) {
        let person_asking = interaction.user.id
        let roles = interaction.member.roles.cache.map(role=>role.name)
        roles = roles.filter(x=>x != '@everyone')
        let rolePackage = { type: "roles_request", user: interaction.user, roles: roles, person_asking: person_asking }
        requestInfo(rolePackage, async(roles) => {
            console.log(roles)
        })
        return interaction.reply({ content:`${rolePackage}`, ephemeral: true })
    } 
};