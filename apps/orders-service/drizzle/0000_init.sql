CREATE SCHEMA "orders";
--> statement-breakpoint
CREATE TYPE "orders"."order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "orders"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"status" "orders"."order_status" NOT NULL,
	"currency" text NOT NULL,
	"total_minor" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"payment_id" text,
	"idempotency_key" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"exchange" text NOT NULL,
	"routing_key" text NOT NULL,
	"message_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "outbox_messageId_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "orders"."processed_messages" (
	"message_id" uuid NOT NULL,
	"consumer" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_messages_message_id_consumer_pk" PRIMARY KEY("message_id","consumer")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_uq" ON "orders"."orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders"."orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "orders"."outbox" USING btree ("id") WHERE "orders"."outbox"."published_at" is null;