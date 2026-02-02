CREATE TABLE `site_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`sheet_name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
