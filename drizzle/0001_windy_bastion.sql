CREATE TABLE `ac_units` (
	`id` text PRIMARY KEY NOT NULL,
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
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
