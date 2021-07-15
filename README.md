# Sentry
The AXI Sentry system monitors and records Thargoid Incursions in the game Elite: Dangerous.

Sentry takes data from the [Elite Dangerous Data Network](https://github.com/EDCD/EDDN), the data is processed and filtered for certain system states and stores it in a PostgreSQL database.

The information is then published through multiple API endpoints in the form of JSON.

## Data Flow

The following diagram explains the flow of data through AXI Sentry:

![image](https://user-images.githubusercontent.com/85346345/125729589-67d6b3a4-118a-436b-a12a-b0badc0388fd.png)

## API Endpoints

Recorded Incursions - https://sentry.antixenoinitiative.com/incursions
Active Incursions - https://sentry.antixenoinitiative.com/systems

## How to use for development

1. Download the repository and run `npm i`
2. Create a PostgreSQL database (Try https://customer.elephantsql.com/instance for a simple test server)
3. Run the DB Query in [DBSETUP](/DBSETUP.md) to create the tables
4. Create a file called `.env`, include your DB Secrets like so,

![image](https://user-images.githubusercontent.com/85346345/125184809-26c53f00-e264-11eb-9ee3-62c678161ad7.png)

5. Use `npm run start` to start AXISentry
