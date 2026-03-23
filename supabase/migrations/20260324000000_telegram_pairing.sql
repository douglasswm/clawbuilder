ALTER TABLE public.deployments
  ADD COLUMN telegram_status TEXT
    CHECK (telegram_status IN ('setting_up', 'awaiting_pairing', 'pairing', 'paired', 'failed')),
  ADD COLUMN telegram_bot_username TEXT,
  ADD COLUMN telegram_error TEXT;
