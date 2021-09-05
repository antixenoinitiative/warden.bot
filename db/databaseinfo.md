# Database Info

Warden interfaces with a PostgreSQL database for storing and managing persistent information. This is a shared database with Sentry API.

https://github.com/antixenoinitiative/sentry.api

## Tables

CREATE TABLE systems (
    system_id       SERIAL PRIMARY KEY,
    name            VARCHAR(50),
    status          bool
);
CREATE TABLE incursions (
    inc_id          SERIAL PRIMARY KEY,
    system_id       int,
    time            bigint
);
CREATE TABLE presence (
    system_id       int,
    presence_lvl    int,
    time            bigint
);
CREATE TABLE incursionV2 (
    inc_id          SERIAL PRIMARY KEY,
    system_id       int,
    week            int,
    time            bigint,
);
CREATE TABLE backups(
    id              SERIAL PRIMARY KEY,
    data            text[],
    timestamp       bigint
);
CREATE TABLE events(
    event_id        text,
    embed_id        text,
    name            text,
    description     text,
    creator         text,
    enrolled        text[],
    date            bigint,
);

## Tables (Leaderboard DB)

CREATE TABLE speedrun(
    id              SERIAL PRIMARY KEY,
    user_id         text,
    name            text,
    time            int,
    class           text,
    ship            text,
    variant         text,
    link            text,
    approval        bool,
    date            bigint,
);