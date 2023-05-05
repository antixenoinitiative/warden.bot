const fetch = require('node-fetch');
const {Client, Message, MessageEmbed } = require("discord.js");
const Discord = require("discord.js");
module.exports = {
	data: new Discord.SlashCommandBuilder()
	.setName('weather')
	.setDescription('Shows the weather at a location')
    .addStringOption(option => option.setName('location')
					.setDescription("the location")
					.setRequired(true)),
async execute(interaction) {
    const location = interaction.options.data.find(arg => arg.name === 'location').value

    try {
      const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=475cd1addc2d0836e691e20477dacfc1&units=metric`);
      const data = await response.json();

      const weather = data.weather[0].description;
      const temperature = data.main.temp;
      const feelsLike = data.main.feels_like;

      await interaction.reply(`The weather in ${location} is ${weather} with a temperature of ${temperature}°C (feels like ${feelsLike}°C).`);
    } catch (error) {
      console.error(error);
      await interaction.reply('There was an error while getting the weather for that location.');
    }
  },
};
