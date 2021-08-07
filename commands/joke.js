module.exports = {
	name: 'order66',
	description: ' ',
  format: ' ',
	permlvl: 2,
	restricted: true,
  hidden: true,
	execute(message) {
        async function run() {
            message.channel.send("Deleting Recruits...")
            await new Promise(resolve => setTimeout(resolve, 5000));
            message.channel.send("Recruits Deleted ✅");
        }
        run()
	},
};
