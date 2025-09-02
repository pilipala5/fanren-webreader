-- D1 schema for reading progress
CREATE TABLE IF NOT EXISTS progress (
  username TEXT NOT NULL,
  book TEXT NOT NULL,
  idx INTEGER NOT NULL,
  updated_at REAL NOT NULL,
  PRIMARY KEY (username, book)
);

-- Users table for simple auth (username unique)
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at REAL NOT NULL
);
