'use strict';

const { botIdent } = require('../../functions');

if (botIdent().activeBot.botName !== 'Warden') {
    module.exports = {};
}
else {
    const scheduledEvents = require('../../Warden/scheduledEvents');
    const { createConsoleReporter } = require('../../logging/consoleReporting');
    const report = createConsoleReporter('Scheduled Events').forSubsystem('Gateway');

    function safelyHandle(name, handler) {
        return async (...args) => {
            try {
                return await handler(...args);
            }
            catch (error) {
                report.error(`${name} handling failed`, error);
                return undefined;
            }
        };
    }

    module.exports = {
        guildScheduledEventCreate: safelyHandle('Creation', (event) => scheduledEvents.handleCreate(event)),
        guildScheduledEventUpdate: safelyHandle('Update', (oldEvent, newEvent) => scheduledEvents.handleUpdate(oldEvent, newEvent)),
        guildScheduledEventDelete: safelyHandle('Deletion', (event) => scheduledEvents.handleDelete(event)),
        guildScheduledEventUserAdd: safelyHandle('Interest addition', (event) => scheduledEvents.handleUserAdd(event)),
        guildScheduledEventUserRemove: safelyHandle('Interest removal', (event) => scheduledEvents.handleUserRemove(event)),
    };
}
