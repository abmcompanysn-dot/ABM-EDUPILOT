-- Portes hors ligne : passages décidés sans réseau puis remontés au serveur.
ALTER TABLE door_events ADD COLUMN client_event_id text;
ALTER TABLE door_events ADD COLUMN offline boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX door_events_client ON door_events (device_id, client_event_id) WHERE client_event_id IS NOT NULL;
ALTER TABLE devices ADD COLUMN last_sync_at timestamptz;
