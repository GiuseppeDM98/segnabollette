CREATE TABLE `household_sizes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`house_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`people` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `household_sizes_user_id_idx` ON `household_sizes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_sizes_house_valid_from_uq` ON `household_sizes` (`house_id`,`valid_from`);