import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME ?? "admin").trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const ADMIN_PASSWORD_HASH = (process.env.ADMIN_PASSWORD_HASH ?? "").trim();
const ADMIN_JWT_SECRET = (process.env.ADMIN_JWT_SECRET ?? "").trim();
const SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS ?? 1000 * 60 * 60 * 8);
const JWT_ISSUER = (process.env.ADMIN_JWT_ISSUER ?? "plant-dashboard").trim();
const JWT_AUDIENCE = (process.env.ADMIN_JWT_AUDIENCE ?? "plant-dashboard-admin").trim();

function constantTimeEquals(left, right) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function getSessionTtlMs() {
	if (!Number.isFinite(SESSION_TTL_MS) || SESSION_TTL_MS <= 0) {
		return 1000 * 60 * 60 * 8;
	}
	return SESSION_TTL_MS;
}

function verifyPassword(password) {
	const normalizedPassword = String(password || "");
	if (ADMIN_PASSWORD_HASH) {
		return bcrypt.compareSync(normalizedPassword, ADMIN_PASSWORD_HASH);
	}

	if (!ADMIN_PASSWORD) {
		return false;
	}

	return constantTimeEquals(normalizedPassword, ADMIN_PASSWORD);
}

export function isAdminLoginEnabled() {
	return Boolean(ADMIN_JWT_SECRET && (ADMIN_PASSWORD_HASH || ADMIN_PASSWORD));
}

export function createAdminSession(username, password) {
	if (!isAdminLoginEnabled()) {
		throw new Error("Admin login is disabled because ADMIN_JWT_SECRET and ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD) are required");
	}

	const normalizedUsername = String(username || "").trim();
	if (!constantTimeEquals(normalizedUsername, ADMIN_USERNAME) || !verifyPassword(password)) {
		throw new Error("Invalid admin credentials");
	}

	const ttlMs = getSessionTtlMs();
	const expiresAtMs = Date.now() + ttlMs;
	const token = jwt.sign(
		{
			sub: ADMIN_USERNAME,
			role: "admin",
		},
		ADMIN_JWT_SECRET,
		{
			algorithm: "HS256",
			expiresIn: Math.floor(ttlMs / 1000),
			issuer: JWT_ISSUER,
			audience: JWT_AUDIENCE,
		}
	);


	return {
		token,
		expiresAt: new Date(expiresAtMs).toISOString(),
		username: ADMIN_USERNAME,
	};
}

export function verifyAdminSession(token) {
	if (!token) {
		return false;
	}

	try {
		jwt.verify(token, ADMIN_JWT_SECRET, {
			algorithms: ["HS256"],
			issuer: JWT_ISSUER,
			audience: JWT_AUDIENCE,
		});
		return true;
	} catch {
		return false;
	}
}

export function revokeAdminSession(token) {
	if (!token) return;
	// JWTs are stateless; token revocation requires a denylist store, which is intentionally omitted here.
}
