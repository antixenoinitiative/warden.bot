const Discord = require("discord.js");
const { botIdent,cleanString,botLog,hasSpecifiedRole } = require('../../functions');
const config = require('../../config.json')
function checker(memberroles, rolesToCheck) {
    let found = null
    const containsAllRoles = rolesToCheck.every(role => memberroles.includes(role));
    found = containsAllRoles ? found = containsAllRoles : found = false

    return found
}

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('listrole')
        .setDescription('How many people with rank1 also have rank2... also have rankn?')
        .addSubcommand(subcommand =>
            subcommand
                .setName('role_info')
                .setDescription('Display information about this role')
                .addStringOption(option =>
                    option.setName('role')
                        .setDescription('Add one Role with @ symbol')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('nickname')
                .setDescription('Show users who have the role(s)')
                .addStringOption(option =>
                    option.setName('roles')
                        .setDescription('Add multiple roles using @ symbol')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('count')
                .setDescription('Count users who have the role(s)')
                .addStringOption(option =>
                    option.setName('roles')
                        .setDescription('Add multiple roles using @ symbol')
                        .setRequired(true)
                )
        )
    ,
    permissions: 0,
    async execute(interaction) {
        try {   
            await interaction.deferReply({ ephemeral: true });
            const approvalRanks = config[botIdent().activeBot.botName].listRoleAuthorization
            const approvalRanks_string = approvalRanks.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
            const member = interaction.member
            if (!hasSpecifiedRole(member, approvalRanks)) {
                botLog(interaction.guild,new Discord.EmbedBuilder()
                    .setDescription(`${interaction.member.nickname} does not have access. Requires ${approvalRanks_string}`)
                    .setTitle(`/listrole ${interaction.options.getSubcommand()}`)
                    ,2
                )
                await interaction.editReply({ content: `You do not have the roles to do this command, Contact ${approvalRanks_string}`, ephemeral: true });
                return
            }
            let args = []
            let clean_args = []
            for (let data of interaction.options.data) {
                const items = data.options[0].value.split(/><|> </);
                items.forEach(i=>{ args.push(i) })
            }
            args.forEach((i,index)=>{
                clean_args.push(i.replace(/\D/g,''))
            })
            if (interaction.mentions !== undefined) {
                if(interaction.mentions.roles.length != undefined || interaction.mentions.members.length != undefined)
                throw("Illegal input detected!")
            }
            // let inputMode = interaction.options.data.find(arg => arg.name === 'mode').value
            let roles = []
            let count = 0
            let memberList = []
            roles = clean_args
            const returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            interaction.guild.members.cache.each(member => {
                if (!member.user.bot) { 
                    let memberroles = member._roles
                    // console.log("Member:",member.displayName)
                    // console.log("memberroles:",memberroles)
                    // console.log("roles to check:",roles)
                    const test = checker(memberroles,roles)
                    // console.log("TEST:",test,typeof test)
                    // console.log("-------------")
                    if(test) {
                        count++
                        memberList.push(member.id);
                    }
                }
            })
            memberList.sort()
            let role_names_unsorted_list = []
            let role_names_sorted_string = "\n"
            roles.forEach(i => {
                // console.log("r:",i)
                interaction.guild.roles.cache.find(role => {
                    // console.log("role",role.id,i)
                    if (role.id == i) { 
                        role_names_unsorted_list.push(cleanString(role.name))
                    }
                })
            })
            role_names_unsorted_list.sort()
            role_names_sorted_string = [...new Set(role_names_unsorted_list)]
            // let users = role_names_unsorted_list.members.map(m => m.user.id);
            let lists = [[]]; // Initialize an array to hold lists of users
            let currentListIndex = 0;
            let currentLength = 0;
            for (let user of memberList ) {
                let userMentionLength = `<@${user}>\n`.length;
                if ((currentLength + userMentionLength) <= 950) {
                    lists[currentListIndex].push(`<@${user}>\n`);
                    currentLength += userMentionLength;
                } else {
                    currentListIndex++;
                    lists[currentListIndex] = [`<@${user}>\n`];
                    currentLength = userMentionLength;
                }
            }
            if (interaction.options.getSubcommand() === 'count') {
                returnEmbed.setTitle(`**Count of Cross of N roles**`)
                returnEmbed.addFields(
                    {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                    {name:"Count",value:"```" + count + "```"}
                )
                interaction.followUp({ embeds: [returnEmbed.setTimestamp()] })
            }
            if (interaction.options.getSubcommand() === 'nickname') {
                returnEmbed.setTitle(`**Names of Cross of N roles**`)
                if(memberList == "\n")
                {
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                        {name:"No members were found!",value:"** **"},
                    )
                    interaction.followUp({ embeds: [returnEmbed.setTimestamp()] }) 
                }
                else {
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                        // {name:"Nicknames",value:"```" + memberList_sorted_string + "```"},
                    )
                    if (lists[0].length > 0) {
                        for (let i = 0; i < lists.length; i++) {
                            returnEmbed.addFields({ name: `Users`, value: lists[i].join(""), inline: true });
                        }
                    }
                    interaction.followUp({ embeds: [returnEmbed.setTimestamp()] })
                }
            }
            if (interaction.options.getSubcommand() === 'role_info') {
                try {
                    let roleID = interaction.options.data.find(arg => arg.name === 'role_info').options[0].value.replace(/\D/g,'')
                    let role = interaction.guild.roles.cache.get(roleID)
              
                    const returnEmbed = new Discord.EmbedBuilder()
                    .setColor('#FF7100')
                    .setTitle(`**Role Info - ${role.name}**`)
                    .setDescription(`Role information for ${role}`)
                    .addFields(
                      {name: "Name", value: "```" + role.name + "```", inline: true},
                      {name: "ID", value: "```" + roleID + "```", inline: true},
                      {name: "Total Members", value: "```" + role.members.size + "```", inline: true},
                      {name: "Color", value: "```" + role.hexColor + "```", inline: true},
                      {name: "Position", value: "```" + role.rawPosition + "```", inline: true},
                      {name: "Created", value: "```" + role.createdAt + "```", inline: true},
                    )
                    interaction.followUp({ embeds: [returnEmbed.setTimestamp()] });
                }
                catch(err) {
                    console.error(err);
                    interaction.followUp({ content: `Something went wrong, please try again!` })
                }
            }
        }
        catch(err)
        {
            console.error(err);
            interaction.followUp({ content: `An error occured!\n${err}` })
        }


    }
}