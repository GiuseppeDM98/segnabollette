CREATE TABLE `bill_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`position` integer NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`component` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`quantity` real,
	`quantity_unit` text,
	`unit_price_micros` integer,
	`amount_cents` integer NOT NULL,
	`band` text,
	`is_recalculation` integer DEFAULT false NOT NULL,
	`is_estimated` integer DEFAULT false NOT NULL,
	`vat_rate_bp` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_lines_user_id_idx` ON `bill_lines` (`user_id`);--> statement-breakpoint
CREATE INDEX `bill_lines_bill_id_idx` ON `bill_lines` (`bill_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`supply_id` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`replaced_by_bill_id` text,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`issue_date` text,
	`due_date` text,
	`supplier_name` text,
	`offer_name` text,
	`total_cents` integer NOT NULL,
	`amount_due_cents` integer,
	`conversion_factor` real,
	`calorific_value_gj` real,
	`is_estimated` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supply_id`) REFERENCES `supplies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replaced_by_bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bills_user_id_idx` ON `bills` (`user_id`);--> statement-breakpoint
CREATE INDEX `bills_supply_period_idx` ON `bills` (`supply_id`,`period_start`);--> statement-breakpoint
CREATE TABLE `houses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `houses_user_id_idx` ON `houses` (`user_id`);--> statement-breakpoint
CREATE TABLE `meter_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`supply_id` text NOT NULL,
	`bill_id` text,
	`read_on` text NOT NULL,
	`register` text NOT NULL,
	`value` real NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supply_id`) REFERENCES `supplies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meter_readings_user_id_idx` ON `meter_readings` (`user_id`);--> statement-breakpoint
CREATE INDEX `meter_readings_supply_read_on_idx` ON `meter_readings` (`supply_id`,`read_on`);--> statement-breakpoint
CREATE INDEX `meter_readings_bill_id_idx` ON `meter_readings` (`bill_id`);--> statement-breakpoint
CREATE TABLE `supplies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`house_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`supplier_name` text,
	`identifier` text,
	`has_photovoltaic` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplies_user_id_idx` ON `supplies` (`user_id`);--> statement-breakpoint
CREATE INDEX `supplies_house_id_idx` ON `supplies` (`house_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `supplies_user_identifier_uq` ON `supplies` (`user_id`,`identifier`);