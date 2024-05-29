const Discord = require("discord.js");
const { botIdent, eventTimeCreate, hasSpecifiedRole,botLog } = require('../../../functions')
const objectives = require('../opords/opord_values.json')
const config = require('../../../config.json')
const database = require('../../../GuardianAI/db/database')


module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('carrier_location')
        .setDescription('Select new Location for the Carrier ')
        .addStringOption(option => 
            option
                .setName('carrier_location')
                .setDescription('Pick a System')
                .setRequired(true)
        )
        .addNumberOption(option => 
            option
                .setName('carrier_lightseconds')
                .setDescription('Light Seconds from Star')
                .setRequired(true)
        )
        .addStringOption(option => 
            option
                .setName('carrier_reason')
                .setDescription('Describe why the jump happened')
                .setRequired(true)
        )
        .addNumberOption(option => 
            option
                .setName('carrier_opord')
                .setDescription('Pick an oporder')
                .setRequired(false)
        )
    ,
    permissions: 0,
    async execute(interaction) {
        const carrier_name = `[XSF] GuardianAI - G5Y-67K`
        await interaction.deferReply({ ephemeral: true });

        const inputValues = interaction.options._hoistedOptions
        const jumpLocation = inputValues[0].value
        const lightSeconds = inputValues[1].value
        const description = inputValues[2].value
        const opord = inputValues[3]?.value != null ? inputValues[3].value : null
        const approvalRanks = config[botIdent().activeBot.botName].general_stuff.carrier_jump
        if (!approvalRanks) {
            console.log("[CAUTION]".bgYellow, "Carrier Jump approval Ranks dont match. Check config. Defaulting to Test Server configuration in the .env file.")
            approvalRanks = config[botIdent().activeBot.botName].general_stuff.testServer.carrier_jump //GuardianAI.env
        }
        const approvalRanks_string = approvalRanks.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
        const member = interaction.member;
        if (hasSpecifiedRole(member, approvalRanks) == 0) {
            botLog(interaction.guild,new Discord.EmbedBuilder()
            .setDescription(`${interaction.member.nickname} does not have access. Requires ${approvalRanks_string}`)
            .setTitle(`/${inputValues[0].name}`)
            ,2
            )
            await interaction.editReply({ content: `You do not have the roles to perform this operation.`, ephemeral: true });
            return
        }
        let guardianai = await interaction.guild.members.fetch({query: process.env.BOTNAME, limit: 1})
        guardianai = guardianai.first()
        guardianai.user.setActivity(`${jumpLocation}`, { type: Discord.ActivityType.Custom });
        const embed = new Discord.EmbedBuilder()
                    .setTitle('[XSF] GuardianAI - Jump Complete')
                    // .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#00ECFF') //87FF2A
                    .setDescription(`**Mission**\n${description}`)
                    .addFields({ name: "Carrier", value: carrier_name, inline: true })
                    .addFields({ name: "Ls from Star", value: `${lightSeconds} Ls`, inline: true })
                    .addFields({ name: "System", value: jumpLocation, inline: false })
        if (opord) { 
            //Get embed for oporder
            const opord_number_values = opord
            const opord_number_sql = 'SELECT approved_message_id FROM `opord` WHERE opord_number = (?)';
            const opord_number_response = await database.query(opord_number_sql, opord_number_values)
            if (opord_number_response.length > 0) {
                const embedLink = `https://discord.com/channels/${interaction.guild.id}/${channel_approved.id}/${opord_number_response[0].approved_message_id}`;
                embed.addFields({ name: "Operation Order", value: `Order#: ${opord.toString()}\n${embedLink}`, inline: false })
            }
            else {
                await interaction.editReply({ content: `Could not find Operation Order #:**${opord}**. Try Again.`, ephemeral: true });
                return
            }
        }
        embed.addFields({ name: "Available Services", value: "Refuel, Repair, Rearm, Shipyard, Outfitting, Universal Cartographics, and other standard carrier services."})
        let embed_room = null;
        try {
            embed_room = interaction.guild.channels.cache.find(c => c.name === config[botIdent().activeBot.botName].general_stuff.carrier_jump_room)
            if (!embed_room) {
                console.log("[CAUTION]".bgYellow, `config.json -> ${botIdent().activeBot.botName}.general_stuff.carrier_jump: Check config. Defaulting to Test Server configuration in the .env file.`)
                embed_room = interaction.guild.channels.cache.find(c => c.name === config[botIdent().activeBot.botName].general_stuff.testServer.carrier_jump_room) //GuardianAI.env
            }
        }
        catch (e) {
            console.log("[FAIL]".bgRed, `config.json -> ${botIdent().activeBot.botName}.general_stuff.carrier_jump: Channel IDs dont match. Check config.json`)
        }
        await embed_room.send({ embeds: [embed] })
        await interaction.followUp({ content: `Carrier Jump Complete.`, ephemeral: true });
        botLog(interaction.guild,new Discord.EmbedBuilder()
        .setDescription(`${interaction.member.nickname} Used this command.`)
        .setTitle(`/${inputValues[0].name}`)
        ,0
        )
        // const opord_currentSystem_values = opord
        // const opord_currentSystem_sql = 'SELECT approved_message_id FROM `opord` WHERE opord_number = (?)';
        // const opord_currentSystem_response = await database.query(opord_currentSystem_sql, opord_currentSystem_values)
        // if (opord_currentSystem_response.length > 0) {
        // }
        const opord_currentSystem_values = [jumpLocation]
        const opord_currentSystem_sql =
        `
            INSERT INTO carrier_jump (
                starSystem
            ) 
            VALUES (?);
        `
        await database.query(opord_currentSystem_sql, opord_currentSystem_values)
    } 
};