
/**
 * Migration: 001_initial_schema.js
 * Creates the core StadiumLive PostgreSQL schema.
 */

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE competitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      country VARCHAR(100),
      season VARCHAR(30),
      provider VARCHAR(50),
      provider_competition_id VARCHAR(150),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, provider_competition_id)
    );

    CREATE TABLE teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      short_name VARCHAR(50),
      country VARCHAR(100),
      logo_url TEXT,
      provider VARCHAR(50),
      provider_team_id VARCHAR(150),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, provider_team_id)
    );

    CREATE TABLE matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
      home_team_id UUID NOT NULL REFERENCES teams(id),
      away_team_id UUID NOT NULL REFERENCES teams(id),
      kickoff_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN (
          'scheduled', 'live', 'halftime',
          'finished', 'postponed', 'cancelled'
        )),
      home_score INTEGER CHECK (home_score >= 0),
      away_score INTEGER CHECK (away_score >= 0),
      venue VARCHAR(150),
      provider VARCHAR(50),
      provider_match_id VARCHAR(150),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (home_team_id <> away_team_id),
      UNIQUE (provider, provider_match_id)
    );

    CREATE INDEX matches_kickoff_idx ON matches(kickoff_at);
    CREATE INDEX matches_status_kickoff_idx ON matches(status, kickoff_at);
    CREATE INDEX matches_competition_idx ON matches(competition_id);

    CREATE TABLE room_memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      fan_section VARCHAR(10) NOT NULL DEFAULT 'neutral'
        CHECK (fan_section IN ('home', 'away', 'neutral')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      UNIQUE (user_id, match_id)
    );

    CREATE INDEX room_memberships_match_idx
      ON room_memberships(match_id);

    CREATE TABLE chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body VARCHAR(1000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CHECK (length(trim(body)) > 0)
    );

    CREATE INDEX chat_messages_room_time_idx
      ON chat_messages(match_id, created_at DESC);

    CREATE TABLE message_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason VARCHAR(50) NOT NULL,
      details VARCHAR(500),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (message_id, reporter_user_id)
    );

    CREATE TABLE reactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction VARCHAR(30) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX reactions_room_time_idx
      ON reactions(match_id, created_at DESC);

    CREATE TABLE crowd_snapshots (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      home_count INTEGER NOT NULL DEFAULT 0 CHECK (home_count >= 0),
      away_count INTEGER NOT NULL DEFAULT 0 CHECK (away_count >= 0),
      neutral_count INTEGER NOT NULL DEFAULT 0 CHECK (neutral_count >= 0),
      noise_score NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (noise_score BETWEEN 0 AND 100)
    );

    CREATE INDEX crowd_snapshots_match_time_idx
      ON crowd_snapshots(match_id, captured_at DESC);

    CREATE TABLE polls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      question VARCHAR(300) NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('draft', 'open', 'closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (ends_at IS NULL OR ends_at > starts_at)
    );

    CREATE INDEX polls_match_status_idx ON polls(match_id, status);

    CREATE TABLE poll_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      label VARCHAR(200) NOT NULL,
      position SMALLINT NOT NULL DEFAULT 0,
      UNIQUE (poll_id, position)
    );

    CREATE TABLE poll_votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (poll_id, user_id)
    );

    CREATE INDEX poll_votes_option_idx ON poll_votes(option_id);

    CREATE TABLE prediction_challenges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      question VARCHAR(300) NOT NULL,
      locks_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('draft', 'open', 'locked', 'settled')),
      correct_option VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX predictions_match_status_idx
      ON prediction_challenges(match_id, status);

    CREATE TABLE prediction_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id UUID NOT NULL
        REFERENCES prediction_challenges(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      selected_option VARCHAR(100) NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (challenge_id, user_id)
    );

    CREATE TABLE xp_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
      event_key VARCHAR(80) NOT NULL,
      points INTEGER NOT NULL,
      idempotency_key VARCHAR(150) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX xp_ledger_user_time_idx
      ON xp_ledger(user_id, created_at DESC);

    CREATE TABLE achievements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      achievement_key VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(300) NOT NULL,
      icon_url TEXT,
      xp_reward INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0)
    );

    CREATE TABLE user_achievements (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, achievement_id)
    );

    CREATE TABLE feature_registry (
      feature_key VARCHAR(50) PRIMARY KEY,
      display_name VARCHAR(100) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO feature_registry (feature_key, display_name)
    VALUES
      ('chat', 'Live Chat'),
      ('noise_meter', 'Crowd Noise Meter'),
      ('predictions', 'Match Predictions'),
      ('var_room', 'VAR Room');

    CREATE TABLE product_analytics_events (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
      feature_key VARCHAR(50) REFERENCES feature_registry(feature_key),
      event_key VARCHAR(100) NOT NULL,
      properties JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX analytics_event_time_idx
      ON product_analytics_events(occurred_at DESC);

    CREATE INDEX analytics_event_feature_time_idx
      ON product_analytics_events(feature_key, occurred_at DESC);

    CREATE TABLE product_analytics_daily_metrics (
      metric_date DATE NOT NULL,
      metric_key VARCHAR(100) NOT NULL,
      feature_key VARCHAR(50) REFERENCES feature_registry(feature_key),
      match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
      metric_value BIGINT NOT NULL DEFAULT 0,
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (metric_date, metric_key, feature_key, match_id)
    );

    CREATE TABLE experiments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      experiment_key VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'running', 'paused', 'completed')),
      configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE audit_logs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(100) NOT NULL,
      resource_id VARCHAR(150),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX audit_logs_created_at_idx
      ON audit_logs(created_at DESC);

    CREATE TABLE provider_sync_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(50) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'failed')),
      records_processed INTEGER NOT NULL DEFAULT 0,
      error_summary VARCHAR(1000),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
  `);
};

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS provider_sync_runs;
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS experiments;
    DROP TABLE IF EXISTS product_analytics_daily_metrics;
    DROP TABLE IF EXISTS product_analytics_events;
    DROP TABLE IF EXISTS feature_registry;
    DROP TABLE IF EXISTS user_achievements;
    DROP TABLE IF EXISTS achievements;
    DROP TABLE IF EXISTS xp_ledger;
    DROP TABLE IF EXISTS prediction_submissions;
    DROP TABLE IF EXISTS prediction_challenges;
    DROP TABLE IF EXISTS poll_votes;
    DROP TABLE IF EXISTS poll_options;
    DROP TABLE IF EXISTS polls;
    DROP TABLE IF EXISTS crowd_snapshots;
    DROP TABLE IF EXISTS reactions;
    DROP TABLE IF EXISTS message_reports;
    DROP TABLE IF EXISTS chat_messages;
    DROP TABLE IF EXISTS room_memberships;
    DROP TABLE IF EXISTS matches;
    DROP TABLE IF EXISTS teams;
    DROP TABLE IF EXISTS competitions;
    DROP TABLE IF EXISTS users;
  `);
};
