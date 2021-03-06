/* eslint-disable max-depth */
/* eslint-disable complexity */
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName(`nickname`)
        .setDescription(`Changes your nickname to comply with server rules.`)

        .addStringOption(option => option.setName(`ign`)
            .setDescription(`Your username that appears in game.`)
            .setRequired(true))

        .addStringOption(option => option.setName(`squadroncode`)
            .setDescription(`The 4 character code of your squadron.`)
            .setRequired(false))

        .addStringOption(option => option.setName(`vr`)
            .setDescription(`Do you play in vr?`)
            .setRequired(false)
            .addChoice("Yes", "yes")
            .addChoice("No", "no"))
        .addUserOption(option => option.setName(`user`)
            .setDescription(`Which user's nickname would you like to change? (Admin-Only)`)
            .setRequired(false)),
    permissions: 2,

    async execute(interaction) {

        let targetUserRoles = interaction.member.roles;

        const staffRoles = [
            "380249268818018304",
            "380248896385056769",
            "380248192534577152",
            "880618812792262692"
        ]

        for (let role of staffRoles) {

            if (interaction.member.roles.cache.has(role)) {
                if (interaction.options.data.find(arg => arg.name === `user`)?.value !== undefined) {
                    try {
                        targetUserRoles = interaction.options.data.getMember(arg => arg.name === `user`)?.roles
                    } catch (err) {
                        if (err instanceof TypeError) {
                            interaction.reply({ content: `That user does not exist/the field was empty. Please try again`, ephemeral: true })
                        } else {
                            throw err
                        }
                    }
                    break;
                }
            }
        }


        let inGameName = interaction.options.data.find(arg => arg.name === `ign`).value;
        let squadronCode = interaction.options.data.find(arg => arg.name === `squadroncode`)?.value;

        let newNickname;
        let platforms = [];

        if (targetUserRoles.cache.some(role => role.name === "PC")) {
            if (interaction.options.data.find(arg => arg.name === `vr`) === "yes") {
                platforms.push("PC-VR");
                console.log(`Has platform pc-vr`);
            } else {
                platforms.push("PC");
                console.log(`Has platform pc`);
            }
        }
        if (targetUserRoles.cache.some(role => role.name === "XB")) {
            platforms.push("XB");
            console.log(`Has platform xb`);
        }
        if (targetUserRoles.cache.some(role => role.name === "PS")) {
            platforms.push("PS");
            console.log(`Has platform ps`);
        }

        if (platforms.length === 1) {
            newNickname = `[${platforms[0]}] CMDR ${inGameName}${returnSquadronTag()}`;
            console.log(`Set ${interaction.user.tag}'s username to ${newNickname}`);

        } else if (platforms.length === 2) {
            newNickname = `[${platforms[0]}/${platforms[1]}] CMDR ${inGameName}${returnSquadronTag()}`;
            console.log(`Set ${interaction.user.tag}'s username to ${newNickname}`);

        } else if (platforms.length === 3) {

            newNickname = `[${platforms[0]}/${platforms[1]}/${platforms[2]}] CMDR ${inGameName}${returnSquadronTag()}`;
            console.log(`Set ${interaction.user.tag}'s username to ${newNickname}`);

        }

        await interaction.member.setNickname(newNickname, "Rule 3")

        interaction.reply({ content: `Your nickname is now ${newNickname}`, ephemeral: true })

        function returnSquadronTag() {
            if (squadronCode) {
                return `[${squadronCode}]`
            }
            return ``
        }
    }
}
