Table commands for creating the Database in PostgreSQL

// Create table of systems with a generated ID

CREATE TABLE systems (
  system_id     SERIAL PRIMARY KEY,
  name          VARCHAR(50)
);

// Create table of incursions with reference to system_id of systems

CREATE TABLE incursions (
  inc_id            SERIAL PRIMARY KEY,
  inc_system_id     int,
  date              timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inc_system_id) REFERENCES systems(system_id) ON DELETE CASCADE
);