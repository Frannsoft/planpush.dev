// Set environment variables BEFORE any imports of app/db
process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = 'test-secret-key-at-least-32-characters-long-!';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.GITHUB_ORG = 'test-org';
// Leave SLACK_WEBHOOK_URL unset -> Slack stays a no-op
