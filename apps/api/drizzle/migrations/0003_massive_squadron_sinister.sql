CREATE TABLE `deviceCode` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code` text NOT NULL,
	`user_code` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`last_polled_at` integer,
	`polling_interval` integer,
	`client_id` text,
	`scope` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deviceCode_device_code_unique` ON `deviceCode` (`device_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `deviceCode_user_code_unique` ON `deviceCode` (`user_code`);--> statement-breakpoint
ALTER TABLE `user` ADD `first_name` text;--> statement-breakpoint
ALTER TABLE `user` ADD `last_name` text;--> statement-breakpoint
ALTER TABLE `user` ADD `username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `display_username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `phone_number` text;--> statement-breakpoint
ALTER TABLE `user` ADD `phone_number_verified` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `is_anonymous` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `locale` text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE `user` ADD `timezone` text DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE `user` ADD `theme` text DEFAULT 'system';--> statement-breakpoint
ALTER TABLE `user` ADD `preferences` text DEFAULT '{}';--> statement-breakpoint
ALTER TABLE `user` ADD `last_active_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_number_unique` ON `user` (`phone_number`);