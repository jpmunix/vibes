CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text DEFAULT 'Nueva nota' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
