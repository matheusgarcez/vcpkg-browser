ALTER TABLE `ports` ADD `versions_path` text;
--> statement-breakpoint
CREATE TABLE `historical_port_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`port_name` text NOT NULL,
	`version` text NOT NULL,
	`port_version` integer DEFAULT 0 NOT NULL,
	`git_tree` text NOT NULL,
	`manifest_json` text NOT NULL,
	`usage_text` text,
	`description` text,
	`homepage` text,
	`license` text,
	`supports` text,
	`dependencies_json` text NOT NULL,
	`features_json` text NOT NULL,
	`files_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_port_snapshots_git_tree_unique` ON `historical_port_snapshots` (`git_tree`);
