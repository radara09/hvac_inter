CREATE TABLE `ac_unit_history` (
	`id` text PRIMARY KEY NOT NULL,
	`ac_unit_id` text NOT NULL,
	`user_id` text,
	`changes` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`ac_unit_id`) REFERENCES `ac_units`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`spreadsheet_url` text,
	`sync_enabled` integer DEFAULT false NOT NULL,
	`last_synced_at` integer,
	`last_sync_status` text,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `sites` (`id`, `name`, `description`, `sync_enabled`, `created_at`, `updated_at`) VALUES (
	'site-legacy',
	'Legacy Site',
	'Records yang dibuat sebelum dukungan multi-site',
	0,
	cast(unixepoch('subsecond') * 1000 as integer),
	cast(unixepoch('subsecond') * 1000 as integer)
);
--> statement-breakpoint
CREATE TABLE `user_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`site_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_site_unique` ON `user_sites` (`user_id`,`site_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `site_id` text;--> statement-breakpoint
ALTER TABLE `ac_units` RENAME TO `ac_units_old`;--> statement-breakpoint
CREATE TABLE `ac_units` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`asset_code` text NOT NULL,
	`location` text NOT NULL,
	`brand` text NOT NULL,
	`last_condition` text NOT NULL,
	`last_service_at` integer NOT NULL,
	`technician` text NOT NULL,
	`next_schedule_at` integer NOT NULL,
	`freon_pressure` text,
	`outlet_temp` text,
	`compressor_amp` text,
	`filter_condition` text,
	`photo_url` text,
	`owner_id` text NOT NULL,
	`source_row_ref` text,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `ac_units` (
	`id`,
	`site_id`,
	`asset_code`,
	`location`,
	`brand`,
	`last_condition`,
	`last_service_at`,
	`technician`,
	`next_schedule_at`,
	`freon_pressure`,
	`outlet_temp`,
	`compressor_amp`,
	`filter_condition`,
	`photo_url`,
	`owner_id`,
	`source_row_ref`,
	`last_synced_at`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	'site-legacy' AS `site_id`,
	`asset_code`,
	`location`,
	`brand`,
	`last_condition`,
	`last_service_at`,
	`technician`,
	`next_schedule_at`,
	`freon_pressure`,
	`outlet_temp`,
	`compressor_amp`,
	`filter_condition`,
	`photo_url`,
	`owner_id`,
	NULL AS `source_row_ref`,
	NULL AS `last_synced_at`,
	`created_at`,
	`updated_at`
FROM `ac_units_old`;--> statement-breakpoint
DROP TABLE `ac_units_old`;
