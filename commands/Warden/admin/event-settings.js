'use strict';

const Discord = require('discord.js');
const admin = require('../../../Warden/scheduledEvents/admin');

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('event-settings')
        .setDescription('Publish and synchronize Discord Scheduled Events with the website')
        .setDMPermission(false)
        .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator),
    execute: admin.execute,
};
