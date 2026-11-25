CREATE INDEX IF NOT EXISTS `idx_click_events_sub_link` ON `click_events` (`link_id`,`sub_link_id`,`clicked_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pin_attempts_expires` ON `pin_attempts` (`window_expires_at`);
