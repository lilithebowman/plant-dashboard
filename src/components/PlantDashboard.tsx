// PlantDashboard.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plant, PlantReading } from "../types/plant";
import {
	adminLogin,
	adminLogout,
	fetchPlants,
	fetchAdminPlants,
	createPlant,
	updatePlant,
	deletePlant,
	rotatePlantIngestToken,
	getMoistureEndpoint,
	submitPlantReading,
	type PlantHistoryRange,
	fetchPlantHistory,
} from "../services/api";
import { PlantCard } from "./PlantCard";
import { AddPlantForm } from "./AddPlantForm";
import { PlantHistoryDialog } from "./PlantHistoryDialog";

const SERIAL_BAUD_RATE = 115200;
const USB_SOURCE = "usb-serial";

function normalizeRawValue(rawValue: number): number {
	return Math.max(0, Math.min(4095, Math.round(rawValue)));
}

function parseRawValue(line: string): number | null {
	const trimmed = line.trim();
	if (!trimmed) return null;

	const plainNumberMatch = trimmed.match(/^(\d{1,4})$/);
	if (plainNumberMatch) return normalizeRawValue(Number(plainNumberMatch[1]));

	const legacyMatch = trimmed.match(/Raw analog:\s*(\d{1,4})/i);
	if (legacyMatch) return normalizeRawValue(Number(legacyMatch[1]));

	const rawValueMatch = trimmed.match(/Raw value:\s*(\d{1,4})/i);
	if (rawValueMatch) return normalizeRawValue(Number(rawValueMatch[1]));

	const jsonMatch = trimmed.match(/"rawValue"\s*:\s*(\d{1,4})/i);
	if (jsonMatch) return normalizeRawValue(Number(jsonMatch[1]));

	return null;
}

export const PlantDashboard: React.FC = () => {
	const [plants, setPlants] = useState<Plant[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editLowerRawReading, setEditLowerRawReading] = useState(4095);
	const [editUpperRawReading, setEditUpperRawReading] = useState(1500);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [rotatingToken, setRotatingToken] = useState(false);
	const [detailError, setDetailError] = useState<string | null>(null);
	const [historyPlant, setHistoryPlant] = useState<Plant | null>(null);
	const [historyReadings, setHistoryReadings] = useState<PlantReading[]>([]);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [historyRange, setHistoryRange] = useState<PlantHistoryRange>("last60");
	const [serialBusy, setSerialBusy] = useState(false);
	const [usbStatus, setUsbStatus] = useState("");
	const [activeUsbPlantId, setActiveUsbPlantId] = useState<string | null>(null);
	const [adminToken, setAdminToken] = useState("");
	const [adminUsername, setAdminUsername] = useState("");
	const [adminPassword, setAdminPassword] = useState("");
	const [newIngestToken, setNewIngestToken] = useState<{
		plantId: string;
		plantName: string;
		token: string;
	} | null>(null);

	const serialPortRef = useRef<any | null>(null);
	const serialReaderRef = useRef<any | null>(null);
	const serialBufferRef = useRef("");

	const adminMode = Boolean(adminToken);

	const loadPlants = useCallback(async () => {
		const data = adminMode ? await fetchAdminPlants(adminToken) : await fetchPlants();
		setPlants(data);
		setError(null);
	}, [adminMode, adminToken]);

	useEffect(() => {
		(async () => {
			try {
				await loadPlants();
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(`Failed to load plants. ${message}`);
			} finally {
				setLoading(false);
			}
		})();
	}, [loadPlants]);

	const handleCreate = async (data: {
		name: string;
		uuid: string;
		lowerRawReading: number;
		upperRawReading: number;
	}) => {
		try {
			const result = await createPlant(data);
			setPlants((prev) => [result.plant, ...prev]);
			if (result.ingestToken) {
				setNewIngestToken({
					plantId: result.plant.id,
					plantName: result.plant.name,
					token: result.ingestToken,
				});
			}
			setError(null);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(`Failed to create plant. ${message}`);
		}
	};

	const copyIngestToken = async () => {
		if (!newIngestToken) return;
		await navigator.clipboard.writeText(newIngestToken.token);
	};

	const selectedPlant = selectedPlantId
		? plants.find((plant) => plant.id === selectedPlantId) ?? null
		: null;
	const activeUsbPlant = activeUsbPlantId
		? plants.find((plant) => plant.id === activeUsbPlantId) ?? null
		: null;

	const hasSerialSupport =
		typeof navigator !== "undefined" && "serial" in navigator;
	const selectedPlantHasUsb =
		Boolean(selectedPlant && selectedPlant.id === activeUsbPlantId) &&
		Boolean(serialPortRef.current);

	const openManage = (plant: Plant) => {
		setSelectedPlantId(plant.id);
		setEditName(plant.name);
		setEditLowerRawReading(plant.lowerRawReading);
		setEditUpperRawReading(plant.upperRawReading);
		setDetailError(null);
	};

	const loadPlantHistory = async (plant: Plant, range: PlantHistoryRange) => {
		setHistoryPlant(plant);
		setHistoryReadings([]);
		setHistoryLoading(true);
		setHistoryError(null);

		try {
			const result = await fetchPlantHistory(plant.id, range);
			setHistoryPlant(result.plant);
			setHistoryReadings(result.readings);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setHistoryError(`Failed to load history. ${message}`);
		} finally {
			setHistoryLoading(false);
		}
	};

	const openHistory = async (plant: Plant) => {
		setHistoryRange("last60");
		await loadPlantHistory(plant, "last60");
	};

	const handleHistoryRangeChange = async (range: PlantHistoryRange) => {
		if (!historyPlant || historyLoading || range === historyRange) {
			return;
		}

		setHistoryRange(range);
		await loadPlantHistory(historyPlant, range);
	};

	const closeHistory = () => {
		setHistoryPlant(null);
		setHistoryReadings([]);
		setHistoryError(null);
		setHistoryRange("last60");
	};

	const closeManage = () => {
		if (saving || deleting || rotatingToken) return;
		setSelectedPlantId(null);
		setDetailError(null);
	};

	const readSerialLoop = async (port: any, plantId: string) => {
		const decoder = new TextDecoder();

		while (serialPortRef.current === port && port.readable) {
			const reader = port.readable.getReader();
			serialReaderRef.current = reader;

			try {
				while (true) {
					const result = await reader.read();
					if (result.done) break;

					serialBufferRef.current += decoder.decode(result.value, {
						stream: true,
					});

					const lines = serialBufferRef.current.split(/\r?\n/);
					serialBufferRef.current = lines.pop() || "";

					for (const line of lines) {
						const rawValue = parseRawValue(line);
						if (rawValue === null) continue;

						try {
							const updated = await submitPlantReading(
								plantId,
								rawValue,
								USB_SOURCE
							);
							setPlants((current) =>
								current.map((plant) =>
									plant.id === updated.id ? updated : plant
								)
							);
							setUsbStatus("USB streaming");
						} catch {
							setUsbStatus("USB streaming, sync failed");
						}
					}
				}
			} catch (error) {
				if ((error as { name?: string })?.name !== "AbortError") {
					setUsbStatus("USB error");
				}
			} finally {
				if (serialReaderRef.current === reader) {
					serialReaderRef.current = null;
				}
				try {
					reader.releaseLock();
				} catch {
					// Ignore release errors when lock is already gone.
				}
			}
		}
	};

	const disconnectSerial = async (reason = "user-request") => {
		const port = serialPortRef.current;
		const reader = serialReaderRef.current;

		if (!port && !reader) {
			setActiveUsbPlantId(null);
			if (reason === "user-request") setUsbStatus("");
			return;
		}

		setSerialBusy(true);
		if (reason === "switch-plant") {
			setUsbStatus("USB switching");
		} else if (reason === "user-request") {
			setUsbStatus("USB disconnecting");
		}

		serialPortRef.current = null;

		try {
			if (reader) {
				try {
					await reader.cancel();
				} catch {
					// Ignore reader cancellation race conditions.
				}
			}

			if (port) {
				try {
					await port.close();
				} catch {
					// Ignore close race conditions.
				}
			}
		} finally {
			serialReaderRef.current = null;
			serialBufferRef.current = "";
			setActiveUsbPlantId(null);
			setSerialBusy(false);
			if (reason !== "switch-plant") {
				setUsbStatus(reason === "user-request" ? "USB disconnected" : "");
			}
		}
	};

	const connectUsbToPlant = async (plant: Plant) => {
		if (!hasSerialSupport) {
			setUsbStatus("Web Serial unsupported");
			return;
		}

		setSerialBusy(true);
		try {
			if (serialPortRef.current) {
				await disconnectSerial("switch-plant");
			}

			setUsbStatus("USB selecting");
			const serialApi = (navigator as any).serial;
			const port = await serialApi.requestPort();
			setUsbStatus("USB opening");
			await port.open({ baudRate: SERIAL_BAUD_RATE });

			serialBufferRef.current = "";
			serialPortRef.current = port;
			setActiveUsbPlantId(plant.id);
			setUsbStatus("USB connected");
			void readSerialLoop(port, plant.id);
		} catch (error) {
			const name = (error as { name?: string })?.name;
			if (name === "NotFoundError") {
				setUsbStatus("USB selection cancelled");
			} else if (name === "NetworkError") {
				setUsbStatus("USB busy, close serial monitor");
			} else if (name === "InvalidStateError") {
				setUsbStatus("USB already open");
			} else if (name === "SecurityError") {
				setUsbStatus("USB blocked by browser");
			} else {
				setUsbStatus("USB failed");
			}
		} finally {
			setSerialBusy(false);
		}
	};

	const handleUsbButtonClick = async () => {
		if (!selectedPlant || serialBusy) return;

		if (selectedPlantHasUsb) {
			await disconnectSerial("user-request");
			return;
		}

		await connectUsbToPlant(selectedPlant);
	};

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedPlantId) return;

		setSaving(true);
		setDetailError(null);
		try {
			if (editLowerRawReading === editUpperRawReading) {
				setDetailError("Lower and upper raw readings must be different.");
				setSaving(false);
				return;
			}

			const updated = await updatePlant(selectedPlantId, {
				name: editName,
				lowerRawReading: editLowerRawReading,
				upperRawReading: editUpperRawReading,
			}, {
				adminSessionToken: adminToken || undefined,
			});
			setPlants((prev) =>
				prev.map((plant) => (plant.id === updated.id ? updated : plant))
			);
			setSelectedPlantId(null);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setDetailError(`Failed to save plant. ${message}`);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!selectedPlantId) return;
		if (!window.confirm("Delete this plant?")) return;

		setDeleting(true);
		setDetailError(null);
		try {
			if (selectedPlantId === activeUsbPlantId) {
				await disconnectSerial("delete-plant");
			}
			await deletePlant(selectedPlantId, {
				adminSessionToken: adminToken || undefined,
			});
			setPlants((prev) => prev.filter((plant) => plant.id !== selectedPlantId));
			setSelectedPlantId(null);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setDetailError(`Failed to delete plant. ${message}`);
		} finally {
			setDeleting(false);
		}
	};

	const handleRotateIngestToken = async () => {
		if (!selectedPlantId) return;

		setRotatingToken(true);
		setDetailError(null);
		try {
			const result = await rotatePlantIngestToken(selectedPlantId, {
				adminSessionToken: adminToken || undefined,
			});

			const currentPlant = plants.find((plant) => plant.id === selectedPlantId);
			setNewIngestToken({
				plantId: result.plantId,
				plantName: currentPlant?.name ?? "Plant",
				token: result.ingestToken,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setDetailError(`Failed to rotate ingest token. ${message}`);
		} finally {
			setRotatingToken(false);
		}
	};

	const handleAdminLogin = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);
		try {
			const session = await adminLogin(adminUsername.trim(), adminPassword);
			setAdminToken(session.token);
			setAdminPassword("");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(`Admin login failed. ${message}`);
		}
	};

	const handleAdminLogout = async () => {
		if (!adminToken) return;
		try {
			await adminLogout(adminToken);
		} catch {
			// Ignore logout network errors and clear client state.
		}
		setAdminToken("");
		setAdminUsername("");
		setAdminPassword("");
	};

	useEffect(() => {
		if (!hasSerialSupport) return;
		const serialApi = (navigator as any).serial;
		if (typeof serialApi?.addEventListener !== "function") return;

		const handleDisconnect = () => {
			if (serialPortRef.current) {
				void disconnectSerial("device-disconnect");
			}
		};

		serialApi.addEventListener("disconnect", handleDisconnect);
		return () => {
			serialApi.removeEventListener("disconnect", handleDisconnect);
		};
	}, [hasSerialSupport]);

	useEffect(() => {
		return () => {
			void disconnectSerial("unmount");
		};
	}, []);

	const usbButtonLabel = selectedPlantHasUsb
		? serialBusy
			? "Disconnecting..."
			: "Disconnect USB"
		: serialBusy
			? "Connecting..."
			: activeUsbPlant && selectedPlant && activeUsbPlant.id !== selectedPlant.id
				? "Move USB here"
				: "Connect via USB";

	const activeSource = selectedPlantHasUsb
		? USB_SOURCE
		: selectedPlant?.source ?? "api";

	const usbHelpText =
		activeUsbPlant && selectedPlant && activeUsbPlant.id !== selectedPlant.id
			? `USB is currently attached to ${activeUsbPlant.name}. Connecting here will switch the stream.`
			: "";

	const calibrationDirection =
		editUpperRawReading > editLowerRawReading
			? "Normal scale: higher raw = wetter"
			: "Inverted scale: lower raw = wetter";

	return (
		<div className="dashboard">
			<header className="dashboard__header">
				<div className="dashboard__brand">CODE PUB</div>
				<h1 className="dashboard__title">Plant Health Dashboard</h1>
				<div className="dashboard__admin">
					{adminMode ? (
						<div className="dashboard__admin-session">
							<span className="dashboard__admin-badge">Admin mode enabled</span>
							<button type="button" className="ghost-button" onClick={handleAdminLogout}>
								Logout
							</button>
						</div>
					) : (
						<form className="dashboard__admin-form" onSubmit={handleAdminLogin}>
							<input
								type="text"
								value={adminUsername}
								onChange={(event) => setAdminUsername(event.target.value)}
								placeholder="Admin username"
								autoComplete="username"
								required
							/>
							<input
								type="password"
								value={adminPassword}
								onChange={(event) => setAdminPassword(event.target.value)}
								placeholder="Admin password"
								autoComplete="current-password"
								required
							/>
							<button type="submit" className="ghost-button">Admin login</button>
						</form>
					)}
				</div>
			</header>

			<main className="dashboard__main">
				<AddPlantForm onCreate={handleCreate} />
				{error ? <p className="dashboard__error">{error}</p> : null}

				{loading ? (
					<p className="dashboard__loading">Loading plants…</p>
				) : plants.length === 0 ? (
					<section className="dashboard__empty">
						<p className="dashboard__empty-eyebrow">Start here</p>
						<h2>No plants yet.</h2>
						<p>
							Create your first plant, then post sensor readings to
							<code>/api/plants/&lt;uuid&gt;/readings</code>.
						</p>
					</section>
				) : (
					<div className="dashboard__grid">
						{plants.map((plant) => (
							<PlantCard
								key={plant.id}
								plant={plant}
								onManage={openManage}
								onOpenHistory={openHistory}
							/>
						))}
					</div>
				)}
			</main>

			{historyPlant ? (
				<PlantHistoryDialog
					plant={historyPlant}
					readings={historyReadings}
					loading={historyLoading}
					error={historyError}
					range={historyRange}
					onChangeRange={handleHistoryRangeChange}
					onClose={closeHistory}
				/>
			) : null}

			{newIngestToken ? (
				<div className="modal-backdrop" role="presentation" onClick={() => setNewIngestToken(null)}>
					<div className="modal-panel" role="dialog" onClick={(event) => event.stopPropagation()}>
						<div className="modal-head">
							<div>
								<p className="modal-eyebrow">Save this now</p>
								<h2>{newIngestToken.plantName} ingest token</h2>
							</div>
							<button type="button" className="modal-close" onClick={() => setNewIngestToken(null)}>
								Close
							</button>
						</div>
						<p className="add-plant-form__subtitle">
							This token is only shown once. Use it in your ESP32 or firmware when posting readings.
						</p>
						<code className="modal-code">{newIngestToken.token}</code>
						<p className="add-plant-form__subtitle">
							Send with header <code>X-Plant-Token</code> or bearer token to <code>{getMoistureEndpoint(newIngestToken.plantId)}</code>.
						</p>
						<div className="modal-actions">
							<button type="button" className="ghost-button" onClick={() => void copyIngestToken()}>
								Copy token
							</button>
							<button type="button" className="ghost-button" onClick={() => setNewIngestToken(null)}>
								Done
							</button>
						</div>
					</div>
				</div>
			) : null}

			{selectedPlant ? (
				<div className="modal-backdrop" onClick={closeManage} role="presentation">
					<div
						className="modal-panel"
						onClick={(event) => event.stopPropagation()}
						role="dialog"
					>
						<div className="modal-head">
							<div>
								<p className="modal-eyebrow">Plant settings</p>
								<h2>{selectedPlant.name}</h2>
							</div>
							<button
								type="button"
								className="modal-close"
								onClick={closeManage}
							>
								Close
							</button>
						</div>

						<form className="modal-form" onSubmit={handleSave}>
							<label className="modal-field">
								<span>Plant name</span>
								<input
									type="text"
									value={editName}
									onChange={(e) => setEditName(e.target.value)}
								/>
							</label>

							<div className="modal-field">
								<span>Plant UUID</span>
								<code className="modal-code">{selectedPlant.id}</code>
							</div>

							<div className="modal-field">
								<span>POST endpoint</span>
								<code className="modal-code">
									{getMoistureEndpoint(selectedPlant.id)}
								</code>
								<button
									type="button"
									className="ghost-button"
									onClick={handleRotateIngestToken}
									disabled={saving || deleting || rotatingToken}
								>
									{rotatingToken ? "Rotating token..." : "Rotate ingest token"}
								</button>
							</div>

							<div className="transport-panel">
								<div className="transport-copy">
									<span className="transport-label">Source</span>
									<div className="source-options">
										<div className={`source-option ${activeSource === USB_SOURCE ? "source-option-active" : ""}`}>
											<div>
												<strong>USB</strong>
												<span>Live from this browser</span>
											</div>
											{activeSource === USB_SOURCE ? <em>Active</em> : null}
										</div>
										<div className={`source-option ${activeSource !== USB_SOURCE ? "source-option-active" : ""}`}>
											<div>
												<strong>API</strong>
												<span>Posted by sensor firmware</span>
											</div>
											{activeSource !== USB_SOURCE ? <em>Active</em> : null}
										</div>
									</div>
									{usbHelpText ? <p className="usb-status">{usbHelpText}</p> : null}
									{usbStatus ? <p className="usb-status">{usbStatus}</p> : null}
								</div>
								<button
									type="button"
									className="ghost-button usb-button"
									onClick={handleUsbButtonClick}
									disabled={serialBusy || !hasSerialSupport}
								>
									{usbButtonLabel}
								</button>
							</div>

							<div className="modal-field">
								<div className="modal-field-row">
									<span>Lower raw reading (0%)</span>
									<strong>{editLowerRawReading}</strong>
								</div>
								<input
									type="number"
									min={0}
									max={4095}
									value={editLowerRawReading}
									onChange={(e) => setEditLowerRawReading(Math.max(0, Math.min(4095, Number(e.target.value) || 0)))}
								/>
							</div>

							<div className="modal-field">
								<div className="modal-field-row">
									<span>Upper raw reading (100%)</span>
									<strong>{editUpperRawReading}</strong>
								</div>
								<input
									type="number"
									min={0}
									max={4095}
									value={editUpperRawReading}
									onChange={(e) => setEditUpperRawReading(Math.max(0, Math.min(4095, Number(e.target.value) || 0)))}
								/>
								<div className="modal-scale">
									<span>{calibrationDirection}</span>
								</div>
							</div>

							<div className="modal-metrics">
								<div>
									<span>Latest raw</span>
									<strong>{selectedPlant.latestRawValue ?? "--"}</strong>
								</div>
								<div>
									<span>Moisture</span>
									<strong>
										{selectedPlant.moisture == null
											? "--"
											: `${Math.round(selectedPlant.moisture)}%`}
									</strong>
								</div>
								<div>
									<span>Source</span>
									<strong>{selectedPlant.source ?? "api"}</strong>
								</div>
							</div>

							{detailError ? <p className="dashboard__error">{detailError}</p> : null}

							<div className="modal-actions">
								<button type="submit" className="add-plant-form__submit" disabled={saving || deleting || rotatingToken || editLowerRawReading === editUpperRawReading}>
									{saving ? "Saving..." : "Save changes"}
								</button>
								<button
									type="button"
									className="modal-delete"
									onClick={handleDelete}
									disabled={saving || deleting || rotatingToken}
								>
									{deleting ? "Deleting..." : "Delete plant"}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}

			<footer className="dashboard__footer">
				<a
					href="https://github.com/lilithebowman/plant-dashboard"
					target="_blank"
					rel="noreferrer"
				>
					View this project on GitHub
				</a>
			</footer>
		</div>
	);
};
