# Sentry
The AXI Sentry system monitors and records Thargoid Incursions in the game Elite: Dangerous.

This project is a work-in-progress

## How to use for development

1. Download the repository and run `npm i`
2. Create a PostgreSQL database (Try https://customer.elephantsql.com/instance for a simple test server)
3. Run the DB Query in [DBSETUP](/DBSETUP.md) to create the tables
4. Create a file called `.env`, include your DB Secrets like so,

![image](https://user-images.githubusercontent.com/85346345/125184809-26c53f00-e264-11eb-9ee3-62c678161ad7.png)

5. Use `npm run start` to start AXISentry
