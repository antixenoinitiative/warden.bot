const Discord = require("discord.js");
const { cleanString } = require("../../discord/cleanString");
const { getRoleID } = require("../../discord/getRoleID");
const { SlashCommandBuilder } = require('@discordjs/builders');

function checker(memberrolearray, requestedroles) {
    return requestedroles.every(elem => memberrolearray.indexOf(elem)>-1)
}

module.exports = {
    data: new SlashCommandBuilder()
	.setName('crossn')
	.setDescription('How many people with rank1 also have rank2... also have rankn?')
    .addStringOption(option => option.setName('mode')
		.setDescription('Which mode to run the command as.')
		.setRequired(true)
        .addChoice('Count', 'count')
		.addChoice('Nickname', 'nickname')
		.addChoice('Club 7', 'club7'))
    .addStringOption(option => option.setName('roles')
		.setDescription('List roles to check "role1" "role2"')
		.setRequired(false)),
    usage: '"club7/count/nickname(optional, default=nickname)" "role1" "role2" ... "rolen"',
	permlvl: 0, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
    execute(interaction) {
        let args = []
        for (let data of interaction.options.data) {
            args.push(data.value);
        }
        console.log(args)
        try
        {
            if(interaction.mentions.roles.length != undefined || interaction.mentions.members.length != undefined)
                throw("Illegal input detected!")
            let inputMode = interaction.options.data.find(arg => arg.name === 'mode').value
            let roles = []
            let count = 0
            let memberList = []
            let mode = ""
            if(inputMode !== "count" && inputMode !== "nickname")
            {
                mode = "nickname"
                if(inputMode == "club7")
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
                    args.forEach(arg => roles.push(getRoleID(interaction,arg)))
            }
            else
            {
                mode = inputMode
                args.slice(1,).forEach(arg => roles.push(getRoleID(interaction,arg)))
            }
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            
            
            interaction.guild.members.cache.each(member => {
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
                role_names_unsorted_list.push(cleanString(interaction.guild.roles.cache.find(role => role.id == rolein).name))
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
                interaction.channel.send({ embeds: [returnEmbed.setTimestamp()] })
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
                    interaction.channel.send({ embeds: [returnEmbed.setTimestamp()] }) 
                }
                else
                {
                    
                    returnEmbed.addFields(
                        {name:"Members with the following roles:",value:"```" + role_names_sorted_string + "```"},
                        {name:"Nicknames",value:"```" + memberList_sorted_string + "```"},
                    )
                    interaction.channel.send({ embeds: [returnEmbed.setTimestamp()] })  
                }
            }
        }
        catch(err)
        {
            console.error(err);
            interaction.channel.send({ content: `An error occured!\n${err}` })
        }
    },
};