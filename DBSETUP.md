Table commands for creating the Database in PostgreSQL

// Create table of systems with a generated ID

CREATE TABLE systems (
  system_id     SERIAL PRIMARY KEY,
  name          VARCHAR(50),
  status        boolean
);
CREATE TABLE incursions (
  inc_id            SERIAL PRIMARY KEY,
  system_id         int,
  time              bigint
);