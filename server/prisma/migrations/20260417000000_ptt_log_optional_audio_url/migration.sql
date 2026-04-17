-- Make audioUrl optional on ptt_logs to support dev environments without storage
ALTER TABLE "ptt_logs" ALTER COLUMN "audioUrl" DROP NOT NULL;
