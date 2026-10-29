CREATE TABLE `verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`token_hash` text NOT NULL,
	`code` text,
	`type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verif_identifier_idx` ON `verification_tokens` (`identifier`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `city` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `country` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_info` text;