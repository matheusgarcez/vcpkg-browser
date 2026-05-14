CREATE TABLE `port_patch_stats` (
	`port_name` text PRIMARY KEY NOT NULL,
	`patch_count` integer NOT NULL,
	`patch_bytes_total` integer NOT NULL,
	`declared_patch_count` integer NOT NULL,
	`burden_label` text NOT NULL,
	`patch_files_json` text NOT NULL,
	`unreferenced_patch_files_json` text,
	`missing_patch_files_json` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `port_source_provenance` (
	`port_name` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`source_url` text,
	`normalized_repo_url` text,
	`ref` text,
	`ref_kind` text,
	`quality` text NOT NULL,
	`is_exact` integer NOT NULL,
	`confidence` integer NOT NULL,
	`detected_from` text NOT NULL,
	`reason` text NOT NULL,
	`reference_url` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `port_registry_stats` (
	`port_name` text PRIMARY KEY NOT NULL,
	`current_version_published_at` text,
	`last_changed_at` text,
	`churn_30d` integer NOT NULL,
	`churn_90d` integer NOT NULL,
	`churn_365d` integer NOT NULL,
	`same_version_port_bumps` integer,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_port_registry_stats_churn_90d_port_name` ON `port_registry_stats` (`churn_90d`,`port_name`);
--> statement-breakpoint
CREATE TABLE `packaging_risk_scores` (
	`port_name` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`label` text NOT NULL,
	`reasons_json` text NOT NULL,
	`components_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`port_name`) REFERENCES `ports`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_packaging_risk_scores_score_port_name` ON `packaging_risk_scores` (`score`,`port_name`);
