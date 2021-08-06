const Discord = require("discord.js");
const fs = require('fs')
module.exports = {
	name: 'member',
	description: 'Lists the tag/username/id/nickname(default = nickname) of members with given role, limited to maxlength(default = 10) in embed if txt is used. CSV will not embed and gives all of the types, ignores further arguments.',
    format: '"role" "csv/txt" "tag/username/id/nickname" "maxlength"',
	permlvl: 0,
	restricted: false,
    execute (message, args) {
        try {
			// Function to remove any ASCII characters that are not helpful, eg. - Magic spaces after progression ranks
			// Also trims the spaces now.
			function cleanString(input)
			{
				var output = "";
				for(var i=0;i<input.length;i++)
				{
					if(input.charCodeAt(i)<=127)
					{
						output+=input.charAt(i);
					}
				}
				return output.trim();
			}
			roles = {}
			roles_name = {}
			message.guild.roles.cache
			.forEach(role => {
				roles[cleanString(role.name.trim().toLowerCase().replace(/[.,\/#!$\^&\*;:{}=\-_`'~()]/g,""))] = role.id
				roles_name[cleanString(role.name.trim().toLowerCase().replace(/[.,\/#!$\^&\*;:{}=\-_`'~()]/g,""))] = cleanString(role.name)
			})
            var role = args[0].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
            console.log(role)
            var mode = ""
            if(args[1] == undefined)
            {
                mode = "txt"
            }
            else
            {
                mode = args[1].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
            }
            let memberwithrole = message.guild.roles.cache.get(roles[role]).members
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
                if(memberList.match(/[\n]/g).length <= highlength)
                {
                    const returnEmbed = new Discord.MessageEmbed()
			        .setColor('#FF7100')
                    .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                    .setTitle("**Member List**")
                    returnEmbed.addField("List of members holding rank " + roles_name[role] +":",memberList)
                    message.channel.send(returnEmbed.setTimestamp());
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