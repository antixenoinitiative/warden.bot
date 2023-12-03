const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`fixroles`)
    .setDescription(`Makes sure all users have Recruit or Apollo and fix seperators. WARNING, CREATES A LOT OF SPAM.`)
    .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator),
    // permissions: 0, //probably dont need due to Administrator flag being set, slash command isn't even available to the public.
    async execute (interaction) {
        interaction.deferReply()
        try {
            interaction.channel.send({ content: "Processing, this may take a while."})
            let updated = 0
            let count = 0

            // fix all missing recruits
            let users = await interaction.guild.members.fetch()
            console.log(users)
            for (let [, value] of users) {
                if (!value.roles.cache.find(r => r.id === "380247760668065802")) {
                    try {
                        await value.roles.add('380247760668065802');
                        console.log(`Adding role Recruit to user ${value}`)
                        count++
                    } catch (err) {
                        console.log(err)
                    }
                }
            }

            interaction.editReply({ content: `Stage 1 Complete, ${count} processed total, ${updated} recruits fixed`})
            
            // Fix Leftover Recruits on Apollos + Seperators
            updated = 0
            let apollo = interaction.guild.roles.cache.get("380254463170183180").members
            for (let [, value] of apollo) {
                if (!value.roles.cache.find(r => r.id === "642839749777948683")) { await value.roles.add("642839749777948683"); updated++ }
                if (!value.roles.cache.find(r => r.id === "642840406580658218")) { await value.roles.add("642840406580658218"); updated++ }
                if (value.roles.cache.find(r => r.id === "380247760668065802")) { await value.roles.remove("380247760668065802"); updated++ }
                count++;
            }
            interaction.channel.send({ content: `Stage 2 Complete, ${count} processed total, ${updated} roles fixed, starting Stage 2...`})

            // Fix Seperators on Recruits
            updated = 0
            let recruits = interaction.guild.roles.cache.get("380247760668065802").members
            for (let [, value] of recruits) {
                if (!value.roles.cache.find(r => r.id === "642839749777948683")) { await value.roles.add("642839749777948683"); updated++ }
                if (!value.roles.cache.find(r => r.id === "642840406580658218")) { await value.roles.add("642840406580658218"); updated++ }
                count++;
            }
            interaction.channel.send({ content: `Stage 3 Complete, ${count} processed total. ${updated} roles updated.`})
            
        } catch (err) {
            console.error(err)
        }
    }
}
