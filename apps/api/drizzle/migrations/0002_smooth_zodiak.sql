CREATE TABLE `organization_role` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `permission` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'General' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permission_key_unique` ON `permission` (`key`);--> statement-breakpoint
CREATE TABLE `role` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_system` integer DEFAULT false NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_key_unique` ON `role` (`key`);--> statement-breakpoint
CREATE TABLE `role_permission` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`permission_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_key`) REFERENCES `permission`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_role` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`organization_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `billing_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`stripe_product_id` text,
	`stripe_price_id_monthly` text,
	`stripe_price_id_yearly` text,
	`price_monthly` integer DEFAULT 0 NOT NULL,
	`price_yearly` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`features` text,
	`limits` text,
	`is_public` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_plan_slug_unique` ON `billing_plan` (`slug`);--> statement-breakpoint
CREATE TABLE `billing_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `billing_plan`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `api_key` ADD `key_type` text DEFAULT 'secret' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_key` ADD `environment` text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_key` ADD `allowed_origins` text;--> statement-breakpoint
ALTER TABLE `user` ADD `public_metadata` text;--> statement-breakpoint
ALTER TABLE `user` ADD `private_metadata` text;--> statement-breakpoint
ALTER TABLE `user` ADD `unsafe_metadata` text;--> statement-breakpoint
ALTER TABLE `user` ADD `is_super_admin` integer DEFAULT false;