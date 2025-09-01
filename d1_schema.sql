-- D1 schema for reading progress
CREATE TABLE IF NOT EXISTS progress (
  username TEXT NOT NULL,
  book TEXT NOT NULL,
  idx INTEGER NOT NULL,
  updated_at REAL NOT NULL,
  PRIMARY KEY (username, book)
);

