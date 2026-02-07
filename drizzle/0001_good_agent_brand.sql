CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`apiKeyEncrypted` text NOT NULL,
	`apiBaseUrl` varchar(512) NOT NULL DEFAULT 'https://api.manus.im',
	`isDefault` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`manusTaskId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`accountId` int NOT NULL,
	`title` varchar(512) DEFAULT 'Untitled Task',
	`status` enum('pending','running','completed','failed','unknown') NOT NULL DEFAULT 'unknown',
	`agentProfile` varchar(64) DEFAULT 'manus-1.6',
	`taskMode` varchar(32) DEFAULT 'agent',
	`projectId` varchar(128),
	`taskUrl` varchar(512),
	`shareUrl` varchar(512),
	`creditUsage` int DEFAULT 0,
	`conversationHistory` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
