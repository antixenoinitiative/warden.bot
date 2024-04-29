const Discord = require("discord.js");
const { botIdent,botLog,hasSpecifiedRole } = require('../../../functions');
const config = require('../../../config.json')
const colors = require('colors')

//Allow changes to ranks
let evaluateRolesStatus = 0


function checker(memberroles, rolesToCheck,type) {
    let found = null
    let containsAllRoles = null;
    if (type == 'donthave_SkillRank') { 
        containsAllRoles = !rolesToCheck.some(role => memberroles.includes(role))
    }
    if (type == 'have_SkillRank') { 
        containsAllRoles = rolesToCheck.some(role => memberroles.includes(role))
    } 
    if (type == 'have_XSFRanks') { 
        containsAllRoles = rolesToCheck.some(role => memberroles.includes(role))
    }
    found = containsAllRoles ? found = containsAllRoles : found = false
    return found
}

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('evaluateroles')
        .setDescription('Check dividers and basic roles')
    ,
    async execute(interaction) {
        try {   
            await interaction.deferReply({ ephemeral: true });
            const approvalRanks = config[botIdent().activeBot.botName].general_stuff.evaluateRoles_authorized
            const approvalRanks_string = approvalRanks.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
            const member = interaction.member
            if (hasSpecifiedRole(member, approvalRanks) == 0) {
                botLog(interaction.guild,new Discord.EmbedBuilder()
                    .setDescription(`${interaction.member.nickname} does not have access. Requires ${approvalRanks_string}`)
                    .setTitle(`/${interaction.commandName}`)
                    ,2
                )
                await interaction.editReply({ content: `You do not have the roles to do this command, Contact ${approvalRanks_string}`, ephemeral: true });
                return
            }
            const roleMap = config[botIdent().activeBot.botName].general_stuff.onboarding_roles
            const roles = roleMap.map(id => id.id)
            const allRolesMap = config[botIdent().activeBot.botName].general_stuff.allRanks
            const allRoles = allRolesMap.map(id => id.id)
            let dontHaveSkillRanks_memberList = []
            let haveSkillRanks_memberList = []
            interaction.guild.members.cache.each(async member => {
                if (!member.user.bot) {
                    // console.log("memberDisplayName:",member.displayName)
                    // console.log("memberID:",member.id)
                    // console.log("member roles:",member._roles)
                    // console.log("roles to check:",roles)
                    //!Makes a list of people who dont have Decent Pilot, Collector, or Pilot in their roles.
                    const dontHaveSkillRanks = checker(member._roles,roles,'donthave_SkillRank')
                    const haveSkillRanks = checker(member._roles,roles,'have_SkillRank')
                    const haveOfficerRanks = checker(member._roles,allRoles,'have_XSFRanks')
                    //!Makes a list of people 
                    // console.log("TEST: donthave_SkillRank",dontHaveSkillRanks)
                    // console.log("TEST: have_SkillRank",haveSkillRanks)
                    // console.log("TEST: have_XSFRanks",haveOfficerRanks)
                    // console.log("-------------")
                    if (dontHaveSkillRanks == true) {
                        dontHaveSkillRanks_memberList.push(member.id)
                        if (haveOfficerRanks == false) {
                            // console.log("Adding Learner")
                            haveSkillRanks_memberList.push(member.id)
                            if (evaluateRolesStatus) { await member.roles.add(allRolesMap.find(i => i.rank_name == 'Learner').id) }
                        }
                        if (evaluateRolesStatus) { await member.roles.add(roleMap.find(i => i.rank_name == 'Pilot').id) }
                    }
                    if (haveSkillRanks == true && haveOfficerRanks == false) {
                        haveSkillRanks_memberList.push(member.id)
                        if (evaluateRolesStatus) { await member.roles.add(allRolesMap.find(i => i.rank_name == 'Learner').id) }
                    }
                    const dividers = config[botIdent().activeBot.botName].general_stuff.onboarding_roles_dividers.map(i => i.id)
                    if (evaluateRolesStatus) { await member.roles.add(dividers) }
                }
            })
            function mention(userID) { return `<@${userID}>` }
            dontHaveSkillRanks_memberList = dontHaveSkillRanks_memberList.map(member => mention(member))
            dontHaveSkillRanks_memberList = dontHaveSkillRanks_memberList.join(" ")
            haveSkillRanks_memberList = haveSkillRanks_memberList.map(member => mention(member))
            haveSkillRanks_memberList = haveSkillRanks_memberList.join(" ")
            
            
            if (haveSkillRanks_memberList.length > 0 || dontHaveSkillRanks_memberList.length > 0) {
                const embed = new Discord.EmbedBuilder()
                .setColor('#FF7100')
                .setTitle('Evaluated Roles')
                .setDescription('This command gives role dividers and ensures basic roles; XSF Ranks and Skill Ranks.')
                .addFields(
                    { name: "Rank of Pilot Given", value: dontHaveSkillRanks_memberList, inline: true },
                    { name: "Rank of Learner Given", value: haveSkillRanks_memberList, inline: true }
                )
                // const room = interaction.guild.channels.cache.find(c => c.name === config[botIdent().activeBot.botName].general_stuff.testServer.test_room)
                // await room.send({ embeds: [embed] })

                await interaction.editReply({ content: `Action Complete`, embeds:[embed], ephemeral: true });
            }
            else { 
                await interaction.editReply({ content: `No Action Taken`, ephemeral: true });
            }
        }
        catch(e) {
            console.log("You may not have properly setup the config.json file.")
            console.log(e)
        }
    }
}