CREATE TABLE `debate_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debate_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`injected_items` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`debate_id`) REFERENCES `debates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `debate_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debate_tags_name_unique` ON `debate_tags` (`name`);--> statement-breakpoint
CREATE TABLE `debate_to_tags` (
	`debate_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`debate_id`) REFERENCES `debates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `debate_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debate_tag_unique` ON `debate_to_tags` (`debate_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `debates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
