CREATE TABLE `extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`supply_id` text,
	`batch_id` text,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_micro_usd` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`result_json` text,
	`error_code` text,
	`error_message` text,
	`bill_id` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supply_id`) REFERENCES `supplies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `extractions_user_status_idx` ON `extractions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `extractions_batch_idx` ON `extractions` (`batch_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`extraction_id` text,
	`bill_id` text,
	`pathname` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`page_count` integer,
	`sha256` text NOT NULL,
	`position` integer NOT NULL,
	`uploaded_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extraction_id`) REFERENCES `extractions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_pathname_unique` ON `documents` (`pathname`);--> statement-breakpoint
CREATE INDEX `documents_user_id_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_bill_id_idx` ON `documents` (`bill_id`);--> statement-breakpoint
CREATE INDEX `documents_extraction_id_idx` ON `documents` (`extraction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_user_sha256_uq` ON `documents` (`user_id`,`sha256`);
