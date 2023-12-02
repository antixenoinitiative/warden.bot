const Discord = require("discord.js");
async function fetchJoke() {
  const response = await fetch("http://icanhazdadjoke.com", {
    headers: {
      Accept: "application/json",
    },
  });

  return response.json();
}
module.exports = {
  data: new Discord.SlashCommandBuilder()
    .setName(`dadjoke`)
    .setDescription(`Fetches a random dad joke`),
  permissions: 0,
  async execute(interaction) {
    const { joke } = await fetchJoke();
    interaction.reply({
      content: joke,
    });
  },
};
