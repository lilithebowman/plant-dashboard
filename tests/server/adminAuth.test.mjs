import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
	process.env = { ...ORIGINAL_ENV };
	delete process.env.ADMIN_PASSWORD;
	delete process.env.ADMIN_PASSWORD_HASH;
	delete process.env.ADMIN_JWT_SECRET;
	delete process.env.ADMIN_USERNAME;
	delete process.env.ADMIN_SESSION_TTL_MS;
});

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

async function loadAuthModule() {
	return import(`../../server/adminAuth.js?test=${Date.now()}-${Math.random()}`);
}

test("disables login when required env vars are missing", async () => {
	process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("secret-pass", 10);
	const auth = await loadAuthModule();

	assert.equal(auth.isAdminLoginEnabled(), false);
	assert.throws(() => auth.createAdminSession("admin", "secret-pass"), /ADMIN_JWT_SECRET/);
});

test("creates and verifies signed admin sessions", async () => {
	process.env.ADMIN_USERNAME = "admin";
	process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("secret-pass", 10);
	process.env.ADMIN_JWT_SECRET = "test-secret";
	process.env.ADMIN_SESSION_TTL_MS = "60000";

	const auth = await loadAuthModule();
	const session = auth.createAdminSession("admin", "secret-pass");

	assert.equal(session.username, "admin");
	assert.equal(typeof session.token, "string");
	assert.equal(auth.verifyAdminSession(session.token), true);
});

test("rejects invalid credentials and forged tokens", async () => {
	process.env.ADMIN_USERNAME = "admin";
	process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("secret-pass", 10);
	process.env.ADMIN_JWT_SECRET = "test-secret";

	const auth = await loadAuthModule();

	assert.throws(() => auth.createAdminSession("admin", "wrong"), /Invalid admin credentials/);
	assert.equal(auth.verifyAdminSession("forged.token.value"), false);
});
