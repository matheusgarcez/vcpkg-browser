CREATE TABLE `catalog_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `http_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`etag` text,
	`last_modified` text,
	`status` integer,
	`body_json` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_locks` (
	`job_name` text PRIMARY KEY NOT NULL,
	`locked_by` text NOT NULL,
	`locked_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_name` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`progress_current` integer DEFAULT 0,
	`progress_total` integer DEFAULT 0,
	`message` text,
	`error_json` text
);
--> statement-breakpoint
CREATE TABLE `job_state` (
	`job_name` text PRIMARY KEY NOT NULL,
	`cursor_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance_scores` (
	`port_name` text PRIMARY KEY NOT NULL,
	`score` integer,
	`label` text NOT NULL,
	`recency_score` integer,
	`issue_score` integer,
	`pr_score` integer,
	`backlog_score` integer,
	`popularity_score` integer,
	`vcpkg_score` integer,
	`reason_json` text NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `port_dependencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`port_name` text NOT NULL,
	`dependency_name` text NOT NULL,
	`features_json` text,
	`default_features` integer,
	`platform` text,
	`host` integer DEFAULT 0,
	`dependency_type` text,
	`source` text DEFAULT 'manifest' NOT NULL,
	`feature_name` text,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `port_features` (
	`port_name` text NOT NULL,
	`feature_name` text NOT NULL,
	`description` text,
	`dependencies_json` text,
	`supports` text,
	`default_feature` integer DEFAULT false,
	PRIMARY KEY(`port_name`, `feature_name`),
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `port_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`port_name` text NOT NULL,
	`file_type` text NOT NULL,
	`path` text NOT NULL,
	`content` text,
	`size_bytes` integer,
	`sha256` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `port_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`port_name` text NOT NULL,
	`version` text NOT NULL,
	`port_version` integer,
	`git_tree` text,
	`version_date` text,
	`registry_commit` text,
	`published_at` text,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ports` (
	`name` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`version` text,
	`port_version` integer,
	`description` text,
	`homepage` text,
	`license` text,
	`supports` text,
	`usage_text` text,
	`manifest_json` text NOT NULL,
	`portfile_text` text,
	`source_url` text,
	`vcpkg_tree_sha` text,
	`vcpkg_updated_at` text,
	`created_in_registry_at` text,
	`updated_in_registry_at` text,
	`registry_snapshot_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `ports_fts` USING fts5(
	`port_name` UNINDEXED,
	`name`,
	`description`,
	`homepage`,
	`license`,
	`usage_text`,
	`readme_text`,
	`dependencies`,
	`features`,
	`repository`
);
--> statement-breakpoint
CREATE TABLE `registry_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`commit_sha` text NOT NULL,
	`baseline_sha` text,
	`release_version` text,
	`release_published_at` text,
	`indexed_at` text NOT NULL,
	`ports_count` integer NOT NULL,
	`features_count` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registry_snapshots_commit_sha_unique` ON `registry_snapshots` (`commit_sha`);--> statement-breakpoint
CREATE TABLE `triplet_support` (
	`port_name` text NOT NULL,
	`triplet` text NOT NULL,
	`supported` integer NOT NULL,
	PRIMARY KEY(`port_name`, `triplet`),
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `upstream_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`upstream_id` integer NOT NULL,
	`provider_issue_id` text,
	`number` integer,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`state` text,
	`comments` integer,
	`reactions` integer,
	`updated_at` text,
	`created_at` text,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstream_repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `upstream_repositories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`port_name` text NOT NULL,
	`provider` text NOT NULL,
	`owner` text,
	`repo` text,
	`repo_url` text NOT NULL,
	`detected_from` text NOT NULL,
	`confidence` integer NOT NULL,
	`stars` integer,
	`forks` integer,
	`open_issues` integer,
	`open_prs` integer,
	`closed_issues_30d` integer,
	`merged_prs_30d` integer,
	`default_branch` text,
	`pushed_at` text,
	`last_commit_at` text,
	`archived` integer,
	`disabled` integer,
	`readme_markdown` text,
	`readme_summary` text,
	`repo_etag` text,
	`readme_etag` text,
	`issues_etag` text,
	`last_successful_refresh_at` text,
	`last_failed_refresh_at` text,
	`refresh_error` text,
	`refreshed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upstream_repositories_port_name_unique` ON `upstream_repositories` (`port_name`);