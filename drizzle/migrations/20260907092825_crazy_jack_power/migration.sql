CREATE TABLE `welcome_card_claims` (
	`id` text PRIMARY KEY,
	`fingerprint` text NOT NULL,
	`team_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_welcome_card_claims_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_welcome_card_claims_fingerprint` ON `welcome_card_claims` (`fingerprint`);