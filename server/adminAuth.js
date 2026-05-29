import { randomBytes, timingSafeEqual } from "node:crypto";

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME ?? "admin").trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD ?? "").trim();
const SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS ?? 1000 * 60 * 60 * 8);

const sessions = new Map();

function constantTimeEquals(left, right) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function pruneExpiredSessions() {
	const now = Date.now();
	for (const [token, session] of sessions.entries()) {
		if (session.expiresAt <= now) {
			sessions.delete(token);
		}
	}
}

export function isAdminLoginEnabled() {
	return Boolean(ADMIN_PASSWORD);
}

export function createAdminSession(username, password) {
	if (!isAdminLoginEnabled()) {
		throw new Error("Admin login is disabled because ADMIN_PASSWORD is not set");
	}

	const normalizedUsername = String(username || "").trim();
	const normalizedPassword = String(password || "");

	if (!constantTimeEquals(normalizedUsername, ADMIN_USERNAME) || !constantTimeEquals(normalizedPassword, ADMIN_PASSWORD)) {
		throw new Error("Invalid admin credentials");
	}

	pruneExpiredSessions();

	const token = randomBytes(32).toString("hex");
	sessions.set(token, {
		username: ADMIN_USERNAME,
		expiresAt: Date.now() + SESSION_TTL_MS,
	});

	return {
		token,
		expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
		username: ADMIN_USERNAME,
	};
}

export function verifyAdminSession(token) {
	if (!token) {
		return false;
	}

	pruneExpiredSessions();
	const session = sessions.get(token);
	if (!session) {
		return false;
	}

	if (session.expiresAt <= Date.now()) {
		sessions.delete(token);
		return false;
	}

	return true;
}

export function revokeAdminSession(token) {
	if (!token) return;
	sessions.delete(token);
}
