-- DropIndex
DROP INDEX "workspace_invitations_inviter_created_at_idx";

-- DropIndex
DROP INDEX "workspace_invitations_inviter_status_created_at_idx";

-- DropIndex
DROP INDEX "workspace_invitations_workspace_accepted_at_idx";

-- DropIndex
DROP INDEX "workspace_invitations_workspace_inviter_created_at_idx";

-- DropIndex
DROP INDEX "workspace_invitations_workspace_status_created_at_idx";

-- DropIndex
DROP INDEX "workspace_members_workspace_state_created_at_idx";

-- AlterTable
ALTER TABLE "payment_events" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "provider_subscriptions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_trial_usages" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "provider_subscriptions_revenuecat_external_identity_key" RENAME TO "provider_subscriptions_provider_iap_store_external_ref_exte_key";
