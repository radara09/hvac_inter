CREATE TABLE IF NOT EXISTS `site_email_allowlist` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`site_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `site_email_allowlist_email_unique` ON `site_email_allowlist` (`email`);
