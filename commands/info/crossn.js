const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const { getRoleID } = require("../../discord/getRoleID");
module.exports = {
	name: 'crossn',
	description: 'How many people with rank1 also have rank2... also have rankn?',
  	usage: '"count/nickname(optional, default=nickname)" "role1" "role2" ... "rolen"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
    execute(message,args)
    {
        try
        {
            roles = []
            count = 0
            memberList = "\n"
            mode = ""
            if(args[0]!= "count" && args[0]!= "nickname")
            {
                mode = "nickname"
                args.forEach(arg => roles.push(getRoleID(message,arg)))
            }
            else
            {
                mode = args[0]
                args.slice(1,).forEach(arg => roles.push(getRoleID(message,arg)))
            }
            const returnEmbed = new Discord.MessageEmbed()
            	.setColor('#FF7100')
            	.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            
            function checker(memberrolearray, requestedroles)
            {
                return requestedroles.every(elem => memberrolearray.indexOf(elem)>-1)
            }
            message.guild.members.cache.each(member => {
                memberroles = member._roles
                if(checker(memberroles,roles))
                {
                    count+=1
                    memberList = memberList + member.displayName + "\n"
                }
            })
            role_names = "\n"
            roles.forEach(rolein => {
                role_names = role_names + cleanString(message.guild.roles.cache.find(role => role.id == rolein).name) + "\n"
            })
            if(mode == "count")
            {
                returnEmbed.setTitle(`**Count of Cross of N roles**`)
                returnEmbed.addFields(
                    {name:"Members with the following roles:",value:"```" + role_names + "```"},
                    {name:"Count",value:"```" + count + "```"}
                )
                message.channel.send({ embeds: [returnEmbed.setTimestamp()] })
            }
            else
            {
                returnEmbed.setTitle(`**Names of Cross of N roles**`)
                if(memberList == "\n")
                {
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names + "```"},
                        {name:"No members were found!",value:"** **"},
                    )
                    message.channel.send({ embeds: [returnEmbed.setTimestamp()] }) 
                }
                else
                {
                    
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names + "```"},
                        {name:"Nicknames",value:"```" + memberList + "```"},
                    )
                    message.channel.send({ embeds: [returnEmbed.setTimestamp()] })  
                }
            }
        }
        catch(err)
        {
            message.channel.send({ content: `An error occured!\n${err}` })
        }
    },
};