module.exports = {
    name: "fixroles",
    description: " ",
    usage: '',
    args: false,
    permlvl: 2, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    async execute (message) {
        try {
            message.channel.send({ content: "Processing, this may take a while."})

            
            let apollo = message.guild.roles.cache.get("380254463170183180").members

            let count = 0
            let updated = 0
            for (let [, value] of apollo) {
                if (!value.roles.cache.find(r => r.id === "642839749777948683")) { await value.roles.add("642839749777948683"); updated++ }
                if (!value.roles.cache.find(r => r.id === "642840406580658218")) { await value.roles.add("642840406580658218"); updated++ }
                if (value.roles.cache.find(r => r.id === "380247760668065802")) { await value.roles.remove("380247760668065802"); updated++ }
                count++;
            }
            message.reply({ content: `Stage 1 Complete, Processing ${count} Apollo's Complete, ${updated} roles updated, starting Stage 2...`})

            let recruits = message.guild.roles.cache.get("380247760668065802").members
            for (let [, value] of recruits) {
                if (!value.roles.cache.find(r => r.id === "642839749777948683")) { await value.roles.add("642839749777948683"); updated++ }
                if (!value.roles.cache.find(r => r.id === "642840406580658218")) { await value.roles.add("642840406580658218"); updated++ }
                count++;
            }
            message.reply({ content: `Stage 2 Complete, ${count} users processed. ${updated} roles updated.`})
        } catch (err) {
            console.error(err)
        }
    }
}
