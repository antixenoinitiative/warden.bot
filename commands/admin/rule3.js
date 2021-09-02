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
        .addChoice("No", "no")),
    
    permissions: 0,

    async execute(interaction) {
        let interactionAuthorRoles = interaction.member._roles;

        ACTUAL SERVER CODES
        const id = {
            "pc": "428260067901571073",
            "xb": "533774176478035991",
            "ps": "428259777206812682",
        }

        // STAGING platform roles
        // const id = {
        //     "pc": "880618812662235235",
        //     "xb": "880618812662235233",
        //     "ps": "880618812662235234"
        // }

        const inGameName = interaction.option.data.find(arg => arg.name === `ign`);
        const squadronCode = interaction.option.data.find(arg => arg.name === `squadroncode`);

        let newNickname;
        let platforms = [];

        if (interactionAuthorRoles.includes(id.pc)) {
            if (interaction.option.data.find(arg => arg.name === `vr`) === "yes") {
                platforms.push("PC-VR");
            } else {
                platforms.push("PC");
            }
        }
        if (interactionAuthorRoles.includes(id.xb)) platforms.push("XB");
        if (interactionAuthorRoles.includes(id.ps)) platforms.push("PS");

        if (platforms.length === 1) {
            newNickname = `[${platforms[0]}] CMDR ${inGameName} (${squadronCode})`;
        } else if (platforms.length === 2) {
            newNickname = `[${platforms[0]}/${platforms[1]}] CMDR ${inGameName} (${squadronCode})`;
        } else if (platforms.length === 3) {
            newNickname = `[${platforms[0]}/${platforms[1]}/${platforms[2]} CMDR ${inGameName} (${squadronCode})]`;
        }
        
        interaction.member.setNickname(newNickname, "Rule 3")
    }
}
