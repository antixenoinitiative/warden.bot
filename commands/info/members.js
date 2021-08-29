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
	usage: '"role" "csv/txt" "tag/username/id/nickname" "maxlength"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
    args: true,
    execute (message) {
        let args = []
        for (let data of message.options.data) {
            args.push(data.value)
        }
        try {
            var roleID = args[0]
            var mode = ""
            if(args[1] == undefined)
            {
                mode = "txt"
            }
            else
            {
                mode = args[1]
            }
            let memberwithrole = message.guild.roles.cache.get(roleID).members
            let actualrole = cleanString(message.guild.roles.cache.find(role => role.id == roleID).name)
            let memberList = ""
            if(mode == "txt")
            {
                var type = ""
                if(args[2] == undefined)
                {
                    type = "nickname"
                }
                else
                {
                    type = args[2]
                }
                var highlength = 0
                if(args[3] == undefined)
                {
                    highlength = 10
                }
                else
                {
                    highlength = args[3]
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
                    message.reply({ embeds: [returnEmbed.setTimestamp()] });
                }
                else
                {
                    fs.writeFileSync('tmp/memberlist.txt', memberList);
                    message.reply({
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
                    message.reply({
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
			message.reply(`Something went wrong!\nERROR: ${err}`)
		}
    }
}
