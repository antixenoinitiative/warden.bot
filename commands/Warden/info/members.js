const Discord = require("discord.js");
const { cleanString } = require('../../../functions');
const fs = require('fs')

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('members')
	.setDescription('Lists the tag/username/id/nickname(default = nickname) of members with given role.')
    .addRoleOption(option => option.setName('role')
		.setDescription('The role to target')
		.setRequired(true))
    .addStringOption(option => option.setName('output')
		.setDescription('How to output the data')
		.setRequired(true)
        .addChoices(
            {name:'CSV', value:'csv'},
            {name:'TXT', value:'txt'},
        ))
    .addStringOption(option => option.setName('type')
		.setDescription('Type of data to list')
		.setRequired(true)
        .addChoices(
            {name:'Tag', value:'tag'},
            {name:'Username', value:'username'},
            {name:'ID', value:'id'},
            {name:'Nickname', value:'nickname'},
        ))
    .addIntegerOption(option => option.setName('maxlength')
		.setDescription('Total number to list')
		.setRequired(false)),
	    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	permissions: 0,
    execute (interaction) {
        let args = []
        for (let data of interaction.options.data) {
            args.push(data.value)
        }
        try {
            let roleID = interaction.options.data.find(arg => arg.name === 'role').value
            let mode = "txt"
            if (interaction.options.data.find(arg => arg.name === 'output') != undefined) { mode = interaction.options.data.find(arg => arg.name === 'output').value }
            let memberwithrole = interaction.guild.roles.cache.get(roleID).members
            let actualrole = cleanString(interaction.guild.roles.cache.find(role => role.id == roleID).name)
            let memberList = ""
            if(mode == "txt")
            {
                let type = ""
                if(interaction.options.data.find(arg => arg.name === 'type') == undefined)
                {
                    type = "nickname"
                }
                else
                {
                    type = interaction.options.data.find(arg => arg.name === 'type').value
                }
                let highlength = 0
                if(interaction.options.data.find(arg => arg.name === 'maxlength') == undefined)
                {
                    highlength = 10
                }
                else
                {
                    highlength = interaction.options.data.find(arg => arg.name === 'maxlength').value
                }
                let memberEmbedList = []
                memberwithrole.map(m =>
                {
                    if(type == 'tag')
                    {
                        memberList = memberList + m.user.tag + "\n"
                        memberEmbedList.push(m.user.tag)
                    }
                    if(type == 'username')
                    {
                        memberList = memberList + m.user.username + "\n"
                        memberEmbedList.push(m.user.username)
                    }
                    if(type == 'id')
                    {
                        memberList = memberList + m.user.id + "\n"
                        memberEmbedList.push(m.user.id)
                    }
                    if(type == 'nickname')
                    {
                        memberList = memberList + m.displayName + "\n"
                        memberEmbedList.push(m.displayName)
                    }
                })
                let membercount
                try
                {
                    membercount = memberList.match(/[\n]/g).length
                }
                catch(TypeError)
                {
                    throw(`No members found with role ${actualrole}`)
                }
                if(membercount <= highlength)
                // if(memberList.match(/[\n]/g).length <= highlength)
                {
                    const returnEmbed = new Discord.EmbedBuilder()
                    .setColor('#FF7100')
                    .setTitle("**Member List**")
                    returnEmbed.addFields({ name: "List of members holding rank " + actualrole +":", value: `**${memberEmbedList.join("\n")}**`})
                    interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
                }
                else
                {
                    fs.writeFileSync('tmp/memberlist.txt', memberList);
                    //todo Need to verify this tmp directory can be written to on all servers. Emplace check
                    interaction.reply({
                        content:"Members List longer than "+highlength+"!\nSending the " + type +" in a txt file:",
                        files:[
                                "tmp/memberlist.txt"
                              ]
                    })
                }
            }
            else
            {
                if(mode == "csv")
                {
                    memberList = "Discord tag,Discord Username,Discord Id,Server Nickname/displayName\n"
                    memberwithrole.map(m =>
                        {
                                memberList = memberList + m.user.tag + "," + m.user.username + "," + m.user.id + "," +  m.displayName + "\n"

                        })
                    fs.writeFileSync('tmp/memberlist.csv',memberList)
                    interaction.reply({
                                content:"Here's your CSV file:",
                                files:[
                                        "tmp/memberlist.csv"
                                      ]
                    })
                }
                else
                {
                    throw("Wrong file type!")
                }
            }
        } catch(err) {
            console.error(err);
			interaction.reply(`Something went wrong!\nERROR: ${err}`)
		}
    }
}
