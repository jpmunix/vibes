CREATE TABLE `ai_query_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query_type` text NOT NULL,
	`model` text NOT NULL,
	`prompt_snippet` text NOT NULL,
	`payload` text NOT NULL,
	`response` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);