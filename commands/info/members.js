const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const { getRoleID } = require("../../discord/getRoleID");
const fs = require('fs')
module.exports = {
	name: 'members',
	description: 'Lists the tag/username/id/nickname(default = nickname) of members with given role, limited to maxlength(default = 10) in embed if txt is used. CSV will not embed and gives all of the types, ignores further arguments.',
  usage: '"role" "csv/txt" "tag/username/id/nickname" "maxlength"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
  args: true,
    execute (message, args) {
        try {
            var roleID = getRoleID(message,args[0].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim())
            var mode = ""
            if(args[1] == undefined)
            {
                mode = "txt"
            }
            else
            {
                mode = args[1].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
            }
            let memberwithrole = message.guild.roles.cache.get(roleID).members
            let actualrole = cleanString(message.guild.roles.cache.find(role => role.id == roleID).name)
            memberList = ""
            if(mode == "txt")
            {
                var type = ""
                if(args[2] == undefined)
                {
                    type = "nickname"
                }
                else
                {
                    type = args[2].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
                }
                var highlength = 0
                if(args[3] == undefined)
                {
                    highlength = 10
                }
                else
                {
                    highlength = parseInt(args[3].replace(/["'”`‛′’‘]/g,"").trim())
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
                var membercount
                try
                {
                    membercount = memberList.match(/[\n]/g).length
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
                    message.channel.send({ embeds: [returnEmbed.setTimestamp()] });
                }
                else
                {
                    fs.writeFileSync('tmp/memberlist.txt', memberList);
                    message.channel.send("Members List longer than "+highlength+"!\nSending the " + type +" in a txt file:",{
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
                    message.channel.send("Here's your CSV file:",{
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
			message.channel.send(`Something went wrong!\nERROR: ${err}`)
		}
    }
}
