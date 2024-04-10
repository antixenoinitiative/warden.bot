const Discord = require("discord.js");

const { cleanString } = require('../../functions');

function checker(memberrolearray, requestedroles) {
    let result = []
    requestedroles.every(i => {
        i.forEach(a => {
            const res = memberrolearray.includes(a)
            if (res) { result.push(res) }
        })
    })
    return result
}

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('crossn')
	.setDescription('How many people with rank1 also have rank2... also have rankn?')
    .addStringOption(option => option.setName('mode')
		.setDescription('Which mode to run the command as.')
		.setRequired(true)
        .addChoices(
            { name:'Count', value:'count' },
            { name:'Nickname', value:'nickname' },
        ))
    .addStringOption(option => option.setName('roles')
		.setDescription('List roles to check "role1" "role2"')
		.setRequired(true)),
	    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	permissions: 0,
    execute(interaction) {
        try {   
            let args = []
            let clean_args = []
            for (let data of interaction.options.data) { 
                const items = data.value.split(" ")
                items.forEach(i=>{ args.push(i) })
            }
            args.forEach((i,index)=>{
                if (index == 0) { clean_args.push(i) }
                if (index != 0) { clean_args.push(i.replace(/\D/g,'')) }
            })
            if (interaction.mentions !== undefined) {
                if(interaction.mentions.roles.length != undefined || interaction.mentions.members.length != undefined)
                throw("Illegal input detected!")
            }
            let inputMode = interaction.options.data.find(arg => arg.name === 'mode').value
            let roles = []
            let count = 0
            let memberList = []
            let mode = ""
            if(inputMode !== "count" && inputMode !== "nickname")
            {
                mode = "nickname"
            }
            else
            {
                mode = inputMode
                args.slice(1,).forEach(arg => roles.push(clean_args))
            }
            const returnEmbed = new Discord.EmbedBuilder()
            .setColor('#FF7100')
            interaction.guild.members.cache.each(member => {
                let memberroles = member._roles
                const test = checker(memberroles,roles)
                if(test) {
                    count++
                    if (!member.user.bot) { memberList.push(member.id) }
                }
            })
            memberList.sort()
            let role_names_unsorted_list = []
            let role_names_sorted_string = "\n"

            roles.forEach(rolein => {
                rolein.forEach(i=>{
                    interaction.guild.roles.cache.find(role => {
                        if (role.id == i) { 
                            role_names_unsorted_list.push(cleanString(role.name))
                        }
                    })
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

            if(mode == "count")
            {
                returnEmbed.setTitle(`**Count of Cross of N roles**`)
                returnEmbed.addFields(
                    {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                    {name:"Count",value:"```" + count + "```"}
                )
                interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
            }
            else
            {
                returnEmbed.setTitle(`**Names of Cross of N roles**`)
                if(memberList == "\n")
                {
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                        {name:"No members were found!",value:"** **"},
                    )
                    interaction.reply({ embeds: [returnEmbed.setTimestamp()] }) 
                }
                else {
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                        // {name:"Nicknames",value:"```" + memberList_sorted_string + "```"},
                    )
                    for (let i = 0; i < lists.length; i++) {
                        returnEmbed.addFields({ name: `Users`, value: lists[i].join(""), inline: true });
                    }
                    interaction.reply({ embeds: [returnEmbed.setTimestamp()] })  
                }
            }
        }
        catch(err)
        {
            console.error(err);
            interaction.reply({ content: `An error occured!\n${err}` })
        }
    },
};