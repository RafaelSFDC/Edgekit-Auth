CREATE TABLE `installation_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_name` text DEFAULT 'Edgekit Auth' NOT NULL,
	`billing_target_mode` text DEFAULT 'both' NOT NULL,
	`allow_user_org_creation` integer DEFAULT true NOT NULL,
	`default_org_max_members` integer DEFAULT 5,
	`allow_self_signup` integer DEFAULT true NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `webhook_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`description` text,
	`events` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `max_members` integer;--> statement-breakpoint
ALTER TABLE `billing_plan` ADD `granted_permissions` text;--> statement-breakpoint
ALTER TABLE `billing_plan` ADD `trial_days` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `billing_subscription` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `billing_subscription` ADD `canceled_at` integer;