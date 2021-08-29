const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`fixroles`)
    .setDescription(`Fixes user roles to have correct seperators`),
    permlvl: 2,
    async execute (interaction) {
        try {
            interaction.channel.send({ content: "Processing, this may take a while."})
            let updated = 0
            let count = 0

            // Fix missing Recruits
            let pc = interaction.guild.roles.cache.get("428260067901571073").members
            for (let [, value] of pc) {
                if (!value.roles.cache.find(r => r.id === "380254463170183180") && !value.roles.cache.find(r => r.id === "380247760668065802")) {
                    await value.roles.add("380247760668065802");
                    updated++
                }
            }
            let xb = interaction.guild.roles.cache.get("533774176478035991").members
            for (let [, value] of xb) {
                if (!value.roles.cache.find(r => r.id === "380254463170183180") && !value.roles.cache.find(r => r.id === "380247760668065802")) {
                    await value.roles.add("380247760668065802");
                    updated++
                }
            }
            let ps = interaction.guild.roles.cache.get("428259777206812682").members
            for (let [, value] of ps) {
                if (!value.roles.cache.find(r => r.id === "380254463170183180") && !value.roles.cache.find(r => r.id === "380247760668065802")) {
                    await value.roles.add("380247760668065802");
                    updated++
                }
            }
            interaction.reply({ content: `Stage 1 Complete, ${count} processed total, ${updated} recruits fixed, starting Stage 2...`})

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
