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

-- Books library
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  uploader TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  book_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (book_id, idx),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
