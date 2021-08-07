require("dotenv").config();

module.exports = {
	name: 'restart',
	description: 'Restart Sentry **(Admin Only)**',
    format: ' ',
	permlvl: 2,
	restricted: true,
	execute(message) {
        message.channel.send('Restarting... ⏳')
    	.then(msg => message.client.destroy())
    	.then(() => message.client.login(process.env.TOKEN));
	},
};