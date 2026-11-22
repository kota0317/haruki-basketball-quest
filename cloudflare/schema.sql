-- Apply only to a new staging database, never to existing family data.
CREATE TABLE IF NOT EXISTS family_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT);
INSERT OR IGNORE INTO family_snapshot(id, revision, body) VALUES(1,0,NULL);
CREATE TABLE IF NOT EXISTS auth_limit (id INTEGER PRIMARY KEY CHECK(id=1), window INTEGER NOT NULL, count INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS family_auth_limit (ip_hash TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
