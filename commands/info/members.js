const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const fs = require('fs')
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
	.setName('members')
	.setDescription('Lists the tag/username/id/nickname(default = nickname) of members with given role.')
    .addRoleOption(option => option.setName('role')
		.setDescription('The role to target')
		.setRequired(true))
    .addStringOption(option => option.setName('output')
		.setDescription('How to output the data')
		.setRequired(true)
        .addChoice('CSV', 'csv')
		.addChoice('TXT', 'txt'))
    .addStringOption(option => option.setName('type')
		.setDescription('Type of data to list')
		.setRequired(true)
        .addChoice('Tag', 'tag')
		.addChoice('Username', 'username')
        .addChoice('ID', 'id')
        .addChoice('Nickname', 'nickname'))
    .addIntegerOption(option => option.setName('maxlength')
		.setDescription('Total number to list')
		.setRequired(false)),
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
                memberwithrole.map(m =>
                {
                    if(type == 'tag')
                    {
                        memberList = memberList + m.user.tag + "\n"
                    }
                    if(type == 'username')
                    {
                        memberList = memberList + m.user.username + "\n"
                    }
                    if(type == 'id')
                    {
                        memberList = memberList + m.user.id + "\n"
                    }
                    if(type == 'nickname')
                    {
                        memberList = memberList + m.displayName + "\n"
                    }
                })
                let membercount
                try
                {
                    membercount = memberList.match(/[\n]/g).length
                    console.log(membercount);
                }
                catch(TypeError)
                {
                    throw(`No members found with role ${actualrole}`)
                }
                if(memberList.match(/[\n]/g).length <= highlength)
                {
                    const returnEmbed = new Discord.MessageEmbed()
                    .setColor('#FF7100')
                    .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                    .setTitle("**Member List**")
                    returnEmbed.addField("List of members holding rank " + actualrole +":","```"+memberList+"```")
                    interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
                }
                else
                {
                    fs.writeFileSync('tmp/memberlist.txt', memberList);
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
