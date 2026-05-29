// PlantDashboard.tsx
import React, { useEffect, useState } from "react";
import { Plant } from "../types/plant";
import {
	fetchPlants,
	createPlant,
	updatePlant,
	deletePlant,
	getMoistureEndpoint,
} from "../services/api";
import { PlantCard } from "./PlantCard";
import { AddPlantForm } from "./AddPlantForm";

export const PlantDashboard: React.FC = () => {
	const [plants, setPlants] = useState<Plant[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editThreshold, setEditThreshold] = useState(1500);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [detailError, setDetailError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const data = await fetchPlants();
				setPlants(data);
				setError(null);
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(`Failed to load plants. ${message}`);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const handleCreate = async (data: { name: string; uuid: string }) => {
		try {
			const newPlant = await createPlant(data);
			setPlants((prev) => [newPlant, ...prev]);
			setError(null);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(`Failed to create plant. ${message}`);
		}
	};

	const selectedPlant = selectedPlantId
		? plants.find((plant) => plant.id === selectedPlantId) ?? null
		: null;

	const openManage = (plant: Plant) => {
		setSelectedPlantId(plant.id);
		setEditName(plant.name);
		setEditThreshold(plant.wetThreshold);
		setDetailError(null);
	};

	const closeManage = () => {
		if (saving || deleting) return;
		setSelectedPlantId(null);
		setDetailError(null);
	};

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedPlantId) return;

		setSaving(true);
		setDetailError(null);
		try {
			const updated = await updatePlant(selectedPlantId, {
				name: editName,
				wetThreshold: editThreshold,
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
			await deletePlant(selectedPlantId);
			setPlants((prev) => prev.filter((plant) => plant.id !== selectedPlantId));
			setSelectedPlantId(null);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setDetailError(`Failed to delete plant. ${message}`);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className="dashboard">
			<header className="dashboard__header">
				<div className="dashboard__brand">CODE PUB</div>
				<h1 className="dashboard__title">Plant Health Dashboard</h1>
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
							<PlantCard key={plant.id} plant={plant} onManage={openManage} />
						))}
					</div>
				)}
			</main>

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
							</div>

							<div className="modal-field">
								<div className="modal-field-row">
									<span>Wet threshold</span>
									<strong>{editThreshold}</strong>
								</div>
								<input
									type="range"
									min={500}
									max={2049}
									step={1}
									value={editThreshold}
									onChange={(e) => setEditThreshold(Number(e.target.value))}
								/>
								<div className="modal-scale">
									<span>500</span>
									<span>Default 1500</span>
									<span>2049</span>
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
									<strong>{selectedPlant.source ?? "API"}</strong>
								</div>
							</div>

							{detailError ? <p className="dashboard__error">{detailError}</p> : null}

							<div className="modal-actions">
								<button type="submit" className="add-plant-form__submit" disabled={saving || deleting}>
									{saving ? "Saving..." : "Save changes"}
								</button>
								<button
									type="button"
									className="modal-delete"
									onClick={handleDelete}
									disabled={saving || deleting}
								>
									{deleting ? "Deleting..." : "Delete plant"}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</div>
	);
};
