const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const { getRoleID } = require("../../discord/getRoleID");

function checker(memberrolearray, requestedroles) {
    return requestedroles.every(elem => memberrolearray.indexOf(elem)>-1)
}

module.exports = {
	name: 'crossn',
	description: 'How many people with rank1 also have rank2... also have rankn?',
    usage: '"club7/count/nickname(optional, default=nickname)" "role1" "role2" ... "rolen"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
    execute(message,args)
    {
        try
        {
            if(message.mentions.roles.length != undefined || message.mentions.members.length != undefined)
                throw("Illegal input detected!")
            let roles = []
            let count = 0
            let memberList = []
            let mode = ""
            if(args[0]!= "count" && args[0]!= "nickname")
            {
                mode = "nickname"
                if(args[0].toLowerCase() == "club7")
                    roles = [
                                '477645690630307841', //100club
                                '528577192746287104', //annihi
                                '868809340788834324', // Astreas clarity
                                '810410728023916554', //Myr
                                '508638571565940736', //snake
                                '603345251192537098', //soaring
                                '642840616694317104' //vang
                            ]
                else
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
            
            
            message.guild.members.cache.each(member => {
                let memberroles = member._roles
                if(checker(memberroles,roles))
                {
                    count+=1
                    memberList.push(member.displayName)
                }
            })
            memberList.sort()
            let role_names_unsorted_list = []
            let role_names_sorted_string = "\n"
            roles.forEach(rolein => {
                role_names_unsorted_list.push(cleanString(message.guild.roles.cache.find(role => role.id == rolein).name))
            })
            role_names_unsorted_list.sort()
            role_names_unsorted_list.forEach(rolein =>{
                role_names_sorted_string = role_names_sorted_string + rolein + "\n"
            })
            let memberList_sorted_string = "\n"
            memberList.forEach(name =>{
                memberList_sorted_string = memberList_sorted_string + name + "\n"
            })
            if(mode == "count")
            {
                returnEmbed.setTitle(`**Count of Cross of N roles**`)
                returnEmbed.addFields(
                    {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                    {name:"Count",value:"```" + count + "```"}
                )
                message.channel.send({ embeds: [returnEmbed.setTimestamp()] })
            }
            else
            {
                returnEmbed.setTitle(`**Names of Cross of N roles**`)
                if(memberList_sorted_string == "\n")
                {
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                        {name:"No members were found!",value:"** **"},
                    )
                    message.channel.send({ embeds: [returnEmbed.setTimestamp()] }) 
                }
                else
                {
                    
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                        {name:"Nicknames",value:"```" + memberList_sorted_string + "```"},
                    )
                    message.channel.send({ embeds: [returnEmbed.setTimestamp()] })  
                }
            }
        }
        catch(err)
        {
            console.error(err);
            message.channel.send({ content: `An error occured!\n${err}` })
        }
    },
};