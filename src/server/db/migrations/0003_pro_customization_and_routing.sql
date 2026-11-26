CREATE TABLE `site_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT 'Cristian Arando' NOT NULL,
	`headline` text DEFAULT 'Links & Projects' NOT NULL,
	`bio` text DEFAULT 'Curated directory of full-stack projects, interactive micro-landings, open-source repositories, and verified social profiles.' NOT NULL,
	`avatar_url` text DEFAULT '/brand/author-avatar.png' NOT NULL,
	`status_text` text,
	`status_color` text DEFAULT 'emerald' NOT NULL,
	`status_href` text,
	`theme_preset` text DEFAULT 'obsidian-emerald' NOT NULL,
	`custom_accent_hex` text,
	`surface_tone` text DEFAULT 'obsidian' NOT NULL,
	`glow_intensity` text DEFAULT 'subtle' NOT NULL,
	`card_style` text DEFAULT 'glass' NOT NULL,
	`directory_layout` text DEFAULT 'bento' NOT NULL,
	`social_links_json` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `links` ADD `theme_json` text;--> statement-breakpoint
ALTER TABLE `links` ADD `starts_at` integer;--> statement-breakpoint
ALTER TABLE `links` ADD `expired_redirect_url` text;--> statement-breakpoint
ALTER TABLE `links` ADD `is_cloaked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `links` ADD `routing_rules_json` text;--> statement-breakpoint
ALTER TABLE `links` ADD `health_status` text;--> statement-breakpoint
ALTER TABLE `links` ADD `health_status_code` integer;--> statement-breakpoint
ALTER TABLE `links` ADD `health_latency_ms` integer;--> statement-breakpoint
ALTER TABLE `links` ADD `health_checked_at` integer;