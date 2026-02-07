CREATE TABLE `chat_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`message_id` integer,
	`level` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
