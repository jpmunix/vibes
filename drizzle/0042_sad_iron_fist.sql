CREATE TABLE `embeddings_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`source_id` integer NOT NULL,
	`content_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`embedding` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `embeddings_scope_source_key_model` ON `embeddings_cache` (`scope`,`source_id`,`content_key`,`model`);