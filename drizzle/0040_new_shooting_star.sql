ALTER TABLE `knowledge_entries` ADD `durability` text DEFAULT 'permanent';--> statement-breakpoint
ALTER TABLE `knowledge_entries` ADD `superseded_by` integer;--> statement-breakpoint
ALTER TABLE `knowledge_entries` ADD `last_confirmed_at` integer;