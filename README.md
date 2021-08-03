# AXI Sentry
The AXI Sentry system monitors and records Thargoid Incursions in the game Elite: Dangerous.

Sentry takes data from the [Elite Dangerous Data Network](https://github.com/EDCD/EDDN), the data is processed and filtered for certain system states and stores it in a PostgreSQL database.

The information is then published through multiple API endpoints in the form of JSON.

## Data Flow

The following diagram explains the flow of data through AXI Sentry:

![image](https://user-images.githubusercontent.com/85346345/125729589-67d6b3a4-118a-436b-a12a-b0badc0388fd.png)

## API Endpoints

You can view the API Endpoints at [http://sentry.antixenoinitiative.com/](http://sentry.antixenoinitiative.com/)

## How to use for development (Listener)

1. Download the repository and run `npm i`
2. Create a PostgreSQL database (Try https://customer.elephantsql.com/instance for a simple test server)
3. Run the DB Query in [DBSETUP](/DBSETUP.md) to create the tables
4. Create a file called `.env`, include your DB Secrets like so,

![image](https://user-images.githubusercontent.com/85346345/125184809-26c53f00-e264-11eb-9ee3-62c678161ad7.png)

5. Use `npm run start` to start AXISentry

## How to use for development (Discord Bot)

1. Download the repository and run `npm i` and `npm install discord.js`
2. Create a discord bot and paste the key into a .env file, TOKEN=DISCORD_BOT_TOKEN
3. Register a google cloud vision account and download the JSON key. Name this key cloudAPIKey and place it in the repository

## Useful Links
https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot
https://medium.com/analytics-vidhya/setting-up-google-cloud-vision-api-with-node-js-db29d1b6fbe2


4. Use `npm run start` to start AXISentry
