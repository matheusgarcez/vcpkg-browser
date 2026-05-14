ALTER TABLE `upstream_repositories` ADD `repo_created_at` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `homepage_url` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `license_spdx_id` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `license_name` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `primary_language` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `primary_language_color` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `topics_json` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `latest_release_tag` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `latest_release_published_at` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `latest_release_url` text;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `latest_release_is_draft` integer;--> statement-breakpoint
ALTER TABLE `upstream_repositories` ADD `latest_release_is_prerelease` integer;